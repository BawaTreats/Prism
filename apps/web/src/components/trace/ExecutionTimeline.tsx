"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import Skeleton from "@/components/shared/Skeleton";

interface ExecutionTimelineProps {
  nodes: any[];
  currentStep?: number;
  transitionDurationMs?: number;
  onSelectStep?: (index: number) => void;
  resourceProfile?: {
    read_bytes: number;
    read_limit: number;
    write_bytes: number;
    write_limit: number;
  };
  loading?: boolean;
}

const TIMELINE_ROWS = 3;
/** Estimated row height used by the virtualizer for initial layout. */
const ESTIMATED_ROW_HEIGHT = 72;

/**
 * Placeholder mirroring the height of a short timeline so the card does not
 * resize when the first trace nodes arrive.
 */
export function ExecutionTimelineSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow p-6" aria-busy="true">
      <h2 className="text-xl font-semibold mb-4">Execution Timeline</h2>
      <div className="space-y-2">
        {Array.from({ length: TIMELINE_ROWS }, (_, index) => (
          <div key={index} className="p-3 border border-gray-200 rounded">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Skeleton className="h-4 w-8" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExecutionTimeline({
  nodes,
  currentStep = 0,
  transitionDurationMs = 200,
  onSelectStep,
  resourceProfile,
  loading,
}: ExecutionTimelineProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 5,
  });

  // Scroll the active item into view whenever currentStep changes.
  useEffect(() => {
    if (nodes.length > 0) {
      virtualizer.scrollToIndex(currentStep, { align: "auto" });
    }
  }, [currentStep, nodes.length, virtualizer]);

  // Keyboard navigation: arrow keys move between steps.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!onSelectStep) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        onSelectStep(Math.min(currentStep + 1, nodes.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        onSelectStep(Math.max(currentStep - 1, 0));
      }
    },
    [currentStep, nodes.length, onSelectStep],
  );

  if (loading && nodes.length === 0) {
    return <ExecutionTimelineSkeleton />;
  }

  const isApproachingReadLimit =
    resourceProfile &&
    resourceProfile.read_limit > 0 &&
    resourceProfile.read_bytes / resourceProfile.read_limit > 0.9;
  const isApproachingWriteLimit =
    resourceProfile &&
    resourceProfile.write_limit > 0 &&
    resourceProfile.write_bytes / resourceProfile.write_limit > 0.9;

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="bg-white rounded-lg shadow p-4 md:p-6 w-full overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h2 className="text-xl font-semibold">Execution Timeline</h2>
        {(isApproachingReadLimit || isApproachingWriteLimit) && (
          <span className="px-3 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full flex items-center self-start sm:self-auto">
            <span className="mr-1">⚠️</span>
            Storage IO Warning (Approaching limit)
          </span>
        )}
      </div>

      {/* Scrollable virtualizer container */}
      <div
        ref={scrollContainerRef}
        role="listbox"
        aria-label="Execution timeline steps"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="max-h-[600px] overflow-y-auto overflow-x-auto pr-1 -mx-2 px-2 sm:mx-0 sm:px-0 outline-none focus:ring-2 focus:ring-purple-400"
        style={{ scrollBehavior: "smooth" }}
      >
        {/* Total height spacer so the scrollbar reflects the full list */}
        <div
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {virtualItems.map((virtualRow) => {
            const idx = virtualRow.index;
            const node = nodes[idx];
            const isActive = idx === currentStep;

            return (
              <div
                key={idx}
                data-index={idx}
                ref={virtualizer.measureElement}
                role="option"
                aria-selected={isActive}
                onClick={() => onSelectStep?.(idx)}
                style={{
                  position: "absolute",
                  top: virtualRow.start,
                  left: 0,
                  right: 0,
                  transitionDuration: `${transitionDurationMs}ms`,
                  paddingBottom: "8px",
                }}
                className={`min-w-[280px] p-3 border rounded cursor-pointer transition-all ${
                  isActive
                    ? "bg-purple-50 border-purple-500 shadow-sm translate-x-1 border-l-4 border-l-purple-600"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span
                      className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                        isActive
                          ? "bg-purple-600 text-white font-bold"
                          : "text-gray-500 bg-gray-100"
                      }`}
                    >
                      #{idx}
                    </span>
                    <span className="font-mono text-sm font-medium">
                      {node.node?.event_type || "Unknown"}
                    </span>
                    {isActive && (
                      <span className="text-[10px] uppercase font-bold tracking-wider text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full animate-pulse">
                        Current Step
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    Path: {node.path?.join(" → ") || "root"}
                  </span>
                </div>
                {node.node?.data && (
                  <pre
                    className={`mt-2 text-xs overflow-x-auto transition-opacity ${
                      isActive ? "text-purple-900" : "text-gray-600"
                    }`}
                  >
                    {JSON.stringify(node.node.data, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {nodes.length === 0 && (
        <p className="text-gray-500 text-center py-8">
          No trace nodes yet. Waiting for trace data...
        </p>
      )}
    </div>
  );
}

export default ExecutionTimeline;
