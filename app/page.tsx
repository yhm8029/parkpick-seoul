import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";

export default function HomePage() {
  return <><Header /><AppShell /><footer><div className="container"><strong>ParkPick Seoul</strong><span>공공데이터 기반 참고 정보이며 실제 주차 가능을 보장하지 않습니다.</span></div></footer></>;
}
