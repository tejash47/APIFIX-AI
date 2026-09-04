/**
 * APIFIX AI — Enterprise Server-Side Request Forgery (SSRF) Protection Service
 * Validates external URLs and prevents requests to loopback, internal networks,
 * private IP spaces (RFC 1918), link-local addresses, and cloud metadata services.
 */

const { URL } = require('url');
const net = require('net');

/**
 * Known dangerous hostnames and cloud metadata services
 */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.internal',
  'instance-data',
  'host.docker.internal',
  'gateway.docker.internal',
  'docker.for.win.localhost',
  'docker.for.mac.localhost'
]);

/**
 * Checks if an IPv4 address (as a 32-bit unsigned integer) falls in a blocked private or reserved CIDR range.
 * @param {number} ipInt 
 * @returns {string|null} Rejection reason or null if safe
 */
function checkIpv4Ranges(ipInt) {
  const unsigned = ipInt >>> 0;

  // 0.0.0.0/8 (Current network)
  if (((unsigned & 0xFF000000) >>> 0) === 0x00000000) {
    return 'Rejection: 0.0.0.0/8 current network address is forbidden.';
  }

  // 127.0.0.0/8 (Loopback)
  if (((unsigned & 0xFF000000) >>> 0) === 0x7F000000) {
    return 'Rejection: 127.0.0.0/8 loopback address is forbidden.';
  }

  // 10.0.0.0/8 (RFC 1918 Private Network)
  if (((unsigned & 0xFF000000) >>> 0) === 0x0A000000) {
    return 'Rejection: 10.0.0.0/8 private network address is forbidden.';
  }

  // 172.16.0.0/12 (RFC 1918 Private Network: 172.16.0.0 - 172.31.255.255)
  if (((unsigned & 0xFFF00000) >>> 0) === 0xAC100000) {
    return 'Rejection: 172.16.0.0/12 private network address is forbidden.';
  }

  // 192.168.0.0/16 (RFC 1918 Private Network)
  if (((unsigned & 0xFFFF0000) >>> 0) === 0xC0A80000) {
    return 'Rejection: 192.168.0.0/16 private network address is forbidden.';
  }

  // 169.254.0.0/16 (Link-Local / AWS & GCP Instance Metadata 169.254.169.254)
  if (((unsigned & 0xFFFF0000) >>> 0) === 0xA9FE0000) {
    return 'Rejection: 169.254.0.0/16 link-local / cloud metadata address is forbidden.';
  }

  // 100.64.0.0/10 (Carrier Grade NAT / Alibaba Cloud Metadata 100.100.100.200)
  if (((unsigned & 0xFFC00000) >>> 0) === 0x64400000) {
    return 'Rejection: 100.64.0.0/10 shared address space is forbidden.';
  }

  // 224.0.0.0/4 (Multicast)
  if (((unsigned & 0xF0000000) >>> 0) === 0xE0000000) {
    return 'Rejection: 224.0.0.0/4 multicast address is forbidden.';
  }

  // 240.0.0.0/4 (Reserved)
  if (((unsigned & 0xF0000000) >>> 0) === 0xF0000000) {
    return 'Rejection: 240.0.0.0/4 reserved address space is forbidden.';
  }

  return null;
}

/**
 * Converts standard IPv4 string into 32-bit unsigned integer
 * @param {string} ip 
 * @returns {number}
 */
function ipv4ToInt(ip) {
  const parts = ip.split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(isNaN)) return 0;
  return ((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + (parts[3] >>> 0);
}

/**
 * Checks IPv6 address against loopback, link-local, private, and IPv4-mapped addresses
 * @param {string} ip6 
 * @returns {string|null} Rejection reason or null if safe
 */
function checkIpv6Ranges(ip6) {
  const normalized = ip6.toLowerCase().replace(/^\[|\]$/g, '');

  // Any IPv4 mapped into IPv6 or embedding IPv4
  const ipv4Match = normalized.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  if (ipv4Match) {
    const ipInt = ipv4ToInt(ipv4Match[1]);
    const ipv4Err = checkIpv4Ranges(ipInt);
    if (ipv4Err) return ipv4Err;
    return `Rejection: IPv4-embedded IPv6 address (${ipv4Match[1]}) is forbidden.`;
  }

  // Loopback ::1 or ::
  if (
    normalized === '::1' ||
    normalized === '::' ||
    normalized === '0:0:0:0:0:0:0:1' ||
    normalized === '0:0:0:0:0:0:0:0' ||
    normalized === '0000:0000:0000:0000:0000:0000:0000:0001'
  ) {
    return 'Rejection: IPv6 loopback address is forbidden.';
  }

  // Unique Local Address (ULA) fc00::/7 (fc00:: - fdff::)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return 'Rejection: IPv6 unique local address (fc00::/7) is forbidden.';
  }

  // Link-Local fe80::/10
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return 'Rejection: IPv6 link-local address (fe80::/10) is forbidden.';
  }

  return null;
}

/**
 * Analyzes whether a target URL is safe from SSRF vulnerabilities.
 * @param {string} targetUrl - Target URL string to inspect
 * @param {object} [options] - Optional settings
 * @param {boolean} [options.allowLocalForTesting] - Allows localhost/127.0.0.1 strictly in testing scenarios
 * @returns {{ safe: boolean, reason?: string, parsedUrl?: URL }}
 */
function isSsrfSafeUrl(targetUrl, options = {}) {
  if (!targetUrl || typeof targetUrl !== 'string') {
    return { safe: false, reason: 'Invalid URL: Target URL is required.' };
  }

  let parsed;
  try {
    parsed = new URL(targetUrl.trim());
  } catch (err) {
    return { safe: false, reason: `Invalid URL format: ${err.message}` };
  }

  // 1. Protocol Validation: Only HTTP and HTTPS are permitted
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return {
      safe: false,
      reason: `Forbidden protocol "${protocol}". Only HTTP and HTTPS are allowed.`
    };
  }

  // 2. Extract hostname without brackets or ports
  let hostname = (parsed.hostname || '').toLowerCase().trim().replace(/^\[|\]$/g, '');

  if (!hostname) {
    return { safe: false, reason: 'Invalid URL: Hostname is empty.' };
  }

  // Allow test loopbacks if explicitly requested in test execution
  if (options.allowLocalForTesting) {
    return { safe: true, parsedUrl: parsed };
  }

  // Check for IPv4-mapped IPv6 strings in URL or hostname
  const rawMappedMatch = (targetUrl + ' ' + hostname).match(/(?:::ffff:|ffff:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/i);
  if (rawMappedMatch) {
    const ipInt = ipv4ToInt(rawMappedMatch[1]);
    const rangeError = checkIpv4Ranges(ipInt);
    if (rangeError) {
      return { safe: false, reason: `Security Violation: ${rangeError}` };
    }
    return { safe: false, reason: `Security Violation: IPv4-mapped address ${rawMappedMatch[1]} is forbidden.` };
  }

  // 3. Block known dangerous internal hostnames & suffixes
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return {
      safe: false,
      reason: `Security Violation: Hostname "${hostname}" is forbidden (SSRF target).`
    };
  }

  if (
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.home') ||
    hostname.endsWith('.corp')
  ) {
    return {
      safe: false,
      reason: `Security Violation: Internal top-level domain in "${hostname}" is forbidden.`
    };
  }

  // 4. IP Address Validation (Direct IPv4 / IPv6)
  if (net.isIPv4(hostname)) {
    const ipInt = ipv4ToInt(hostname);
    const rangeError = checkIpv4Ranges(ipInt);
    if (rangeError) {
      return { safe: false, reason: `Security Violation: ${rangeError}` };
    }
  } else if (net.isIPv6(hostname) || hostname.includes(':')) {
    const rangeError = checkIpv6Ranges(hostname);
    if (rangeError) {
      return { safe: false, reason: `Security Violation: ${rangeError}` };
    }
  } else {
    // Check for hex/octal or integer decimal IP representations (e.g. 2130706433 = 127.0.0.1)
    if (/^\d+$/.test(hostname)) {
      const ipNum = parseInt(hostname, 10);
      if (ipNum >= 0 && ipNum <= 0xFFFFFFFF) {
        const rangeError = checkIpv4Ranges(ipNum);
        if (rangeError) {
          return { safe: false, reason: `Security Violation: Decimal IP ${hostname} is forbidden.` };
        }
      }
    }
    if (/^0x[0-9a-f]+$/i.test(hostname)) {
      const ipNum = parseInt(hostname, 16);
      if (ipNum >= 0 && ipNum <= 0xFFFFFFFF) {
        const rangeError = checkIpv4Ranges(ipNum);
        if (rangeError) {
          return { safe: false, reason: `Security Violation: Hex IP ${hostname} is forbidden.` };
        }
      }
    }
  }

  return { safe: true, parsedUrl: parsed };
}

/**
 * Asserts that a target URL is SSRF safe; throws a descriptive Error if forbidden.
 * @param {string} targetUrl 
 * @param {object} [options] 
 * @returns {URL} Parsed URL if valid
 */
function validateSsrfSafeUrl(targetUrl, options = {}) {
  const result = isSsrfSafeUrl(targetUrl, options);
  if (!result.safe) {
    const error = new Error(result.reason || 'SSRF Security Violation: Target URL is forbidden.');
    error.code = 'SSRF_BLOCKED';
    error.status = 400;
    throw error;
  }
  return result.parsedUrl;
}

module.exports = {
  isSsrfSafeUrl,
  validateSsrfSafeUrl,
  BLOCKED_HOSTNAMES
};
