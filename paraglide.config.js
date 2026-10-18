/** @type {import("@inlang/paraglide-js").ParaglideVitePluginOptions} */
export const paraglideOptions = {
  project: "./project.inlang",
  outdir: "./src/paraglide",
  strategy: ["cookie", "baseLocale"],
  cookieName: "himmah_locale",
  cookieSameSite: "lax",
  cookieSecure: "auto",
  outputStructure: "message-modules",
};
