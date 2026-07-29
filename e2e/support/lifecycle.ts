export type LifecycleLogEntry = {
    stage: string;
    details: Record<string, unknown>;
};

export type PageLogsResponse = {
    logs: {
        lifecycle: LifecycleLogEntry[];
    };
};

type SendContentMessage = <TResponse = unknown>(message: unknown) => Promise<TResponse>;

export async function getLifecycleLogs(
    sendContentMessage: SendContentMessage
): Promise<LifecycleLogEntry[]> {
    const response = await sendContentMessage<PageLogsResponse>({ message: "getLogs" });
    return response.logs.lifecycle;
}

export function findLifecycleIndex(
    logs: LifecycleLogEntry[],
    stage: string,
    details?: Record<string, unknown>
): number {
    return logs.findIndex(
        (entry) =>
            entry.stage === stage &&
            Object.entries(details ?? {}).every(([key, value]) => entry.details[key] === value)
    );
}
