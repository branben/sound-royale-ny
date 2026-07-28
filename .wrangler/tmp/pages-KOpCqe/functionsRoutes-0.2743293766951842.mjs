import { onRequest as __api___path___js_onRequest } from "/Users/brandonbennett/sound-royale-ny/functions/api/[[path]].js"

export const routes = [
    {
      routePath: "/api/:path*",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api___path___js_onRequest],
    },
  ]