export function parseEnvBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return String(value).toLocaleLowerCase("en-US") === "true";
}

export function createCatalogProviderStatus({
  env,
  catalogMode,
  lentaStoreResolved,
  pyaterochkaConnected,
  pyaterochkaStoreState,
}) {
  const lentaEnabled = parseEnvBoolean(env.LENTA_ENABLED, true);
  const pyaterochkaConfigured = Boolean(env.PYATEROCHKA_MCP_URL);
  return {
    catalogMode,
    lentaEnabled,
    pyaterochkaConfigured,
    pyaterochkaConnected,
    providers: {
      vkusvill: {
        configured: true,
        connected: catalogMode === "live",
      },
      lenta: {
        enabled: lentaEnabled,
        store: lentaStoreResolved ? "resolved" : "missing",
      },
      pyaterochka: {
        configured: pyaterochkaConfigured,
        connected: pyaterochkaConnected,
        store: pyaterochkaStoreState,
      },
    },
  };
}
