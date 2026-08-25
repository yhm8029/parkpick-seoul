import { CarFront, GitFork, ShieldCheck } from "lucide-react";
import { InstallButton } from "@/components/Pwa";

export function Header() {
  const repo = process.env.NEXT_PUBLIC_GITHUB_REPO_URL;
  return <header className="header"><div className="container header-inner"><a href="#top" className="brand"><span><CarFront /></span><strong>ParkPick <small>SEOUL</small></strong></a><div className="header-actions"><span><ShieldCheck size={15} /> 위치 저장 안 함</span><InstallButton />{repo ? <a href={repo} target="_blank" rel="noreferrer" aria-label="GitHub"><GitFork /></a> : null}</div></div></header>;
}
