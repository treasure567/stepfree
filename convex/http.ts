import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { components } from "./_generated/api";
import { registerStaticPageRoutes } from "./lib/staticPages";

const http = httpRouter();

registerStaticPageRoutes(http);
registerStaticRoutes(http, components.staticHosting);

export default http;
