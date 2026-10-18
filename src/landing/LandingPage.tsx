import { InstallApp } from "../pwa/install";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Leaf,
  ShieldCheck,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import { m } from "../paraglide/messages.js";
import { LanguageSelector, useLocale } from "../localization/locale";

export default function LandingPage() {
  useLocale();
  const features = [
    {
      icon: ShieldCheck,
      title: m.feature_account(),
      text: m.feature_account_copy(),
    },
    {
      icon: Building2,
      title: m.feature_workspace(),
      text: m.feature_workspace_copy(),
    },
    {
      icon: CheckCircle2,
      title: m.feature_return(),
      text: m.feature_return_copy(),
    },
  ];
  return (
    <div className="landing">
      <a className="landing-skip" href="#landing-main">
        {m.skip_content()}
      </a>
      <header className="landing-nav">
        <Link to="/" className="brand" aria-label="Himmah">
          <span className="brand-mark">
            <Leaf size={26} />
          </span>
          <span>
            himmah<span className="brand-sub">{m.brand_tagline()}</span>
          </span>
        </Link>
        <nav aria-label={m.main_navigation()}>
          <LanguageSelector />
          <Button variant="ghost" asChild>
            <Link to="/start" search={{ mode: "signin" }}>
              {m.sign_in()}
            </Link>
          </Button>
          <Button asChild>
            <Link to="/start" search={{ mode: "signup" }}>
              {m.get_started()} <ArrowRight size={16} />
            </Link>
          </Button>
        </nav>
      </header>
      <main id="landing-main" className="landing-main">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <Badge variant="outline">{m.landing_eyebrow()}</Badge>
            <h1 id="landing-title">{m.landing_title()}</h1>
            <p>{m.landing_intro()}</p>
            <div className="landing-actions">
              <Button size="lg" asChild>
                <Link to="/start" search={{ mode: "signup" }}>
                  {m.start_organization()} <ArrowRight size={18} />
                </Link>
              </Button>
              <InstallApp />
            </div>
            <p className="landing-note">{m.landing_note()}</p>
          </div>
          <Card className="landing-live-panel">
            <CardContent>
              <span className="eyebrow">{m.landing_available()}</span>
              <h2>{m.landing_panel_title()}</h2>
              <p>{m.landing_panel_intro()}</p>
              <ol className="landing-live-steps">
                {features.map(({ icon: Icon, title, text }) => (
                  <li key={title}>
                    <span className="landing-icon">
                      <Icon size={22} />
                    </span>
                    <div>
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </section>
        <section
          className="landing-invitation"
          aria-labelledby="invitation-title"
        >
          <div>
            <h2 id="invitation-title">{m.landing_cta_title()}</h2>
            <p>{m.landing_cta_copy()}</p>
          </div>
          <Button size="lg" asChild>
            <Link to="/start" search={{ mode: "signup" }}>
              {m.create_workspace()} <ArrowRight size={18} />
            </Link>
          </Button>
        </section>
      </main>
      <footer className="landing-footer">
        <span>{m.footer_tagline()}</span>
        <span>{m.landing_status()}</span>
      </footer>
    </div>
  );
}
