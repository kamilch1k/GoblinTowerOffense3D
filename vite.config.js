import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/GoblinTowerOffense3D/" : "/",
  build: {
    target: "esnext",
  },
});
