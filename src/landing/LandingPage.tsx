import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardCheck,
  Leaf,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";

export default function LandingPage() {
  return (
    <div className="landing">
      <a className="landing-skip" href="#landing-main">
        Skip to content
      </a>
      <header className="landing-nav">
        <Link to="/" className="brand" aria-label="Himmah home">
          <span className="brand-mark">
            <Leaf size={26} />
          </span>
          <span>
            himmah<span className="brand-sub">GROW TOGETHER</span>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <a href="#how-it-works" className="landing-nav-detail">
            How it works
          </a>
          <Button variant="ghost" asChild>
            <Link to="/start">Your account</Link>
          </Button>
          <Button asChild>
            <Link to="/start">
              Get started <ArrowRight size={16} />
            </Link>
          </Button>
        </nav>
      </header>
      <main id="landing-main" className="landing-main">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <Badge variant="outline">HIMMAH HUB · EARLY ACCESS</Badge>
            <h1 id="landing-title">
              Small actions.
              <br />
              Stronger <span>communities.</span>
            </h1>
            <p>
              A place for your mosque’s youth to take part, feel recognised and
              grow together. Bring your activities, attendance and encouragement
              into one shared space.
            </p>
            <div className="landing-actions">
              <Button size="lg" asChild>
                <Link to="/start">
                  Start your organization <ArrowRight size={18} />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/demo">Explore the demo</Link>
              </Button>
            </div>
            <p className="landing-note">
              Built with youth aged 11–15 and their volunteers in mind.
            </p>
          </div>
          <div
            className="landing-preview"
            aria-label="Illustrative Hub preview with fictional activity data"
          >
            <div className="landing-preview-top">
              <span>
                <Leaf size={17} /> YOUR COMMUNITY, CONNECTED
              </span>
              <Badge variant="secondary">Sample preview</Badge>
            </div>
            <h2>
              Good things start
              <br />
              with showing up.
            </h2>
            <p>
              Something to learn. Someone to help.
              <br />A community to belong to.
            </p>
            <Card className="landing-activity">
              <CardContent>
                <div className="landing-activity-heading">
                  <span className="landing-icon">
                    <CalendarDays size={22} />
                  </span>
                  <div>
                    <small>THIS WEEK AT THE MOSQUE</small>
                    <h3>Youth evening</h3>
                  </div>
                </div>
                <p>Learn together, catch up with friends and lend a hand.</p>
                <div className="landing-activity-footer">
                  <span>
                    <Users size={16} /> Your youth group
                  </span>
                  <span>
                    <Check size={15} /> You’re part of it
                  </span>
                </div>
              </CardContent>
            </Card>
            <div className="landing-contribution">
              <span className="landing-icon">
                <Sparkles size={20} />
              </span>
              <div>
                <strong>Every contribution counts.</strong>
                <p>Recognise effort in a way that fits your community.</p>
              </div>
            </div>
          </div>
        </section>
        <section
          id="how-it-works"
          className="landing-how"
          aria-labelledby="how-title"
        >
          <div className="landing-section-intro">
            <span className="eyebrow">LESS ADMIN. MORE CONNECTION.</span>
            <h2 id="how-title">
              Your community.
              <br />
              Your way to grow.
            </h2>
            <p>
              Start with the Hub. Choose the activities and earning rules that
              make sense for your mosque—no quiz or game required.
            </p>
          </div>
          <ol className="landing-steps">
            <li>
              <span>01</span>
              <div>
                <h3>Make a space of your own</h3>
                <p>
                  Create an organizer account and set up your organization’s
                  workspace.
                </p>
                <Badge variant="outline">Available now</Badge>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Bring your activities together</h3>
                <p>
                  Plan youth evenings, record attendance and recognise
                  contributions with custom or manual points.
                </p>
                <Badge variant="secondary">Try in the demo</Badge>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Add a little friendly competition</h3>
                <p>
                  Later, connect Himmah Futsal: turn engagement into player
                  growth in leagues and tournaments.
                </p>
                <Badge variant="secondary">Planned add-on</Badge>
              </div>
            </li>
          </ol>
        </section>
        <section
          className="landing-principles"
          aria-label="Built around your community"
        >
          <div>
            <ClipboardCheck size={24} />
            <h3>Flexible recognition</h3>
            <p>
              Attendance, helping out or your own activities. You decide what to
              recognise.
            </p>
          </div>
          <div>
            <Users size={24} />
            <h3>A space for each organization</h3>
            <p>
              Each mosque sets up its own workspace, with organization-scoped
              access.
            </p>
          </div>
          <div>
            <Trophy size={24} />
            <h3>Hub first. Games when ready.</h3>
            <p>
              Use the engagement app on its own. Connected games are an optional
              next step.
            </p>
          </div>
        </section>
        <section
          className="landing-invitation"
          aria-labelledby="invitation-title"
        >
          <div>
            <span className="eyebrow">LET’S BUILD SOMETHING GOOD</span>
            <h2 id="invitation-title">Give your youth a place to grow.</h2>
            <p>
              Organizer signup and workspace setup are open. Member management,
              activities and points are currently available in the sample demo
              while we build the connected workspace.
            </p>
          </div>
          <Button size="lg" asChild>
            <Link to="/start">
              Create your workspace <ArrowRight size={18} />
            </Link>
          </Button>
        </section>
      </main>
      <footer className="landing-footer">
        <span>
          himmah <span>· Take part. Grow together.</span>
        </span>
        <Link to="/demo">
          Try the sample workspace <ArrowRight size={15} />
        </Link>
      </footer>
    </div>
  );
}
