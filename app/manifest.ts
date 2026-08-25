import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ParkPick Seoul",
    short_name: "ParkPick",
    description: "GPS 기반 서울 공영주차 추천과 카카오맵·네이버지도 연동",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f3f7f6",
    theme_color: "#0b6b57",
    lang: "ko-KR",
    categories: ["navigation", "travel", "utilities"],
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
