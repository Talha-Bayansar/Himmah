import type { ReactNode, Ref } from "react";
import { BookOpen } from "lucide-react";
import { LanguageSelector } from "../localization/locale";
export function QuizShell({
  children,
  mainRef,
}: {
  children: ReactNode;
  mainRef?: Ref<HTMLElement>;
}) {
  return (
    <div className="learning-public">
      <header className="learning-public-header">
        <div className="learning-public-header-inner">
          <span>
            <BookOpen size={22} aria-hidden="true" />
            Himmah
          </span>
          <LanguageSelector />
        </div>
      </header>
      <main ref={mainRef} className="learning-public-main">
        {children}
      </main>
    </div>
  );
}
