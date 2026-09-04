'use client';

import React, { useState } from 'react';
import { ArrowRight, AlertTriangle, CheckCircle, Database, Server, Code, FileText, Info } from 'lucide-react';

export interface ChainNode {
  id: string;
  label: string;
  type: 'request' | 'controller' | 'service' | 'database' | 'failure' | 'response' | 'patch';
  detail: string;
}

export default function CausalChainGraph({
  nodes = [],
  confidence
}: {
  nodes?: ChainNode[];
  confidence?: number | null;
}) {
  const [selectedNode, setSelectedNode] = useState<ChainNode | null>(nodes.length > 0 ? nodes[nodes.length - 1] : null);

  const getIcon = (type: string) => {
    switch (type) {
      case 'request': return <Server className="w-4 h-4 text-indigo-400" />;
      case 'controller': return <Code className="w-4 h-4 text-blue-400" />;
      case 'service': return <FileText className="w-4 h-4 text-cyan-400" />;
      case 'database': return <Database className="w-4 h-4 text-amber-400" />;
      case 'failure': return <AlertTriangle className="w-4 h-4 text-red-400" />;
      case 'response': return <CheckCircle className="w-4 h-4 text-red-500" />;
      case 'patch': return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      default: return <Server className="w-4 h-4 text-gray-400" />;
    }
  };

  const confidenceDisplay = confidence !== null && confidence !== undefined
    ? `[CONFIDENCE: ${Math.round(confidence * (confidence <= 1 ? 100 : 1))}%]`
    : '[CONFIDENCE: UNAVAILABLE]';

  return (
    <div className="p-4 rounded border border-panelBorder bg-panel/75">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider">Causal Chain Analysis</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Select target node in active path to isolate execution context</p>
        </div>
        <span className="font-mono text-[10px] text-gray-400">
          {confidenceDisplay}
        </span>
      </div>

      {/* Node Flow Diagram or Empty State */}
      {nodes.length === 0 ? (
        <div className="py-8 flex flex-col items-center justify-center text-center border border-dashed border-panelBorder rounded bg-bg/40 font-mono text-xs text-gray-400">
          <Info className="w-5 h-5 text-gray-500 mb-2" />
          <span>No causal chain evidence collected yet.</span>
          <span className="text-[10px] text-gray-500 mt-1">Start a scan or import a codebase to trace the failure path.</span>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 py-2 overflow-x-auto">
            {nodes.map((node, idx) => (
              <React.Fragment key={node.id}>
                <button
                  onClick={() => setSelectedNode(node)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded border text-[11px] font-mono transition-all ${
                    selectedNode?.id === node.id
                      ? 'border-indigo-500 bg-indigo-500/20 text-white shadow-lg shadow-indigo-500/10 scale-105'
                      : node.type === 'failure'
                      ? 'border-red-500/40 bg-red-500/10 text-red-300 hover:border-red-500'
                      : 'border-panelBorder bg-bg text-gray-300 hover:border-gray-600'
                  }`}
                >
                  {getIcon(node.type)}
                  <span>{node.label}</span>
                </button>

                {idx < nodes.length - 1 && (
                  <ArrowRight className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Node Inspector Detail Panel */}
          {selectedNode && (
            <div className="mt-4 p-3 rounded border border-panelBorder bg-bg/80 text-[11px] font-mono">
              <div className="flex items-center gap-2 text-indigo-400 font-semibold mb-1">
                {getIcon(selectedNode.type)}
                <span>NODE INSPECTOR // {selectedNode.label}</span>
              </div>
              <p className="text-gray-300 leading-normal">{selectedNode.detail}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

