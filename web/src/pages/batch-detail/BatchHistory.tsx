import React from "react";
import { BatchDetail as BatchDetailType } from "../../api/batches";

export default React.memo(function BatchHistory({ batch }: { batch: BatchDetailType }) {
  if (!batch.history || batch.history.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">History</h3>
      <div className="space-y-0">
        {batch.history.map((event, idx) => (
          <div key={event.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`w-2.5 h-2.5 rounded-full mt-1.5 ${
                  idx === 0 ? "bg-green-500" : "bg-gray-300"
                }`}
              />
              {idx < batch.history.length - 1 && (
                <div className="w-px flex-1 bg-gray-200 mt-1" />
              )}
            </div>
            <div className="pb-4">
              <p className="text-sm font-medium text-gray-800">
                {event.event_type}
                {event.event_subtype && (
                  <span className="text-gray-500 font-normal">
                    {" "}/ {event.event_subtype}
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-500">
                {new Date(event.recorded_at).toLocaleString()}
                {event.recorded_by_name && ` \u00B7 ${event.recorded_by_name}`}
                {event.location_detail && ` — ${event.location_detail}`}
              </p>
              {event.notes && (
                <p className="text-xs text-gray-600 mt-1">{event.notes}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
