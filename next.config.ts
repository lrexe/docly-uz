import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfmake читает шрифты с диска — не бандлим его, а TTF-файлы явно включаем в serverless-сборку.
  serverExternalPackages: ["pdfmake"],
  outputFileTracingIncludes: {
    "/api/generate/export": ["./fonts/**/*"],
  },
};

export default nextConfig;
