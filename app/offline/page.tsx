import { CloudOff } from "lucide-react";
import Link from "next/link";
export default function OfflinePage() { return <main className="offline"><div><CloudOff /><h1>인터넷 연결을 확인해 주세요</h1><p>새 주차정보와 경로를 계산하려면 인터넷 연결이 필요합니다.</p><Link className="button button--primary button--md" href="/">다시 시도</Link></div></main>; }
