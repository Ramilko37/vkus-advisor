export async function measureStage<T>(callback: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const startedAt = performance.now();
  try {
    return { result: await callback(), durationMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    if (error instanceof Error) Object.assign(error, { durationMs: Math.round(performance.now() - startedAt) });
    throw error;
  }
}
