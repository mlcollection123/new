declare const __BUILD__: string | undefined;

export const BUILD = typeof __BUILD__ !== "undefined" ? __BUILD__ : "dev";
