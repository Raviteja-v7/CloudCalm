import { useState, useRef, useEffect } from "react";
import type { FormEvent } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Cloud,
  CloudLightning,
  ExternalLink,
  Heart,
  LoaderCircle,
  Menu,
  MessageCircle,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";

type Choice = {
  label: string;
  value: string;
};

type AgentResponse = {
  message: string;
  step_title: string;
  step_description: string;
  choices: Choice[];
  status:
    | "investigating"
    | "likely_cause_identified"
    | "more_information_needed";
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  agent?: AgentResponse;
};

type Incident = {
  id: string;
  title: string;
  description: string;
  icon: typeof Activity;
  color: string;
  prompt: string;
  label: string;
};

const incidents: Incident[] = [
  {
    id: "alb",
    title: "ALB returning 503",
    description: "My application is unavailable.",
    icon: Activity,
    color: "coral",
    prompt:
      "My application behind an AWS Application Load Balancer is returning HTTP 503 errors. I'm not sure where to start.",
    label: "Load balancing",
  },
  {
    id: "lambda",
    title: "Lambda timeout",
    description: "My function takes too long to respond.",
    icon: CloudLightning,
    color: "amber",
    prompt:
      "My AWS Lambda function keeps timing out. Help me investigate the cause step by step.",
    label: "Serverless",
  },
  {
    id: "s3",
    title: "S3 AccessDenied",
    description: "I can't access an S3 resource.",
    icon: ShieldCheck,
    color: "blue",
    prompt:
      "I'm getting an AccessDenied error when accessing an Amazon S3 bucket or object. Help me troubleshoot it.",
    label: "Storage & permissions",
  },
];

const makeId = () => Math.random().toString(36).slice(2, 11);

const API_URL = import.meta.env.VITE_API_URL?.trim() ?? "";
console.log("CloudCalm API URL:", API_URL);

function App() {
  const [activeIncident, setActiveIncident] = useState<Incident | null>(
    null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (activeIncident) {
      inputRef.current?.focus();
    }
  }, [activeIncident]);

  async function askAgent(
    text: string,
    currentMessages: ChatMessage[],
    incident: Incident,
  ) {
    setLoading(true);
    setError("");

    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      content: text,
    };

    const updatedMessages = [...currentMessages, userMessage];
    setMessages(updatedMessages);
    setInput("");

    try {
      if (!API_URL) {
        throw new Error(
          "The API endpoint isn't configured yet. We'll connect it after the backend is ready.",
        );
      }

      const history = currentMessages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({
          role: message.role,
          content: message.role === "assistant"
            ? message.agent
              ? JSON.stringify(message.agent)
              : message.content
            : message.content,
        }));

      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          incident: text,
          history,
          incidentType: incident.id,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `The troubleshooting service returned HTTP ${response.status}. Please try again.`,
        );
      }

      const data: AgentResponse = await response.json();

      if (
        typeof data.message !== "string" ||
        typeof data.step_title !== "string" ||
        typeof data.step_description !== "string" ||
        !Array.isArray(data.choices)
      ) {
        throw new Error("The troubleshooting service returned an invalid response.");
      }

      setMessages((previous) => [
        ...previous,
        {
          id: makeId(),
          role: "assistant",
          content: data.message,
          agent: data,
        },
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  function startIncident(incident: Incident) {
    setActiveIncident(incident);
    setMessages([]);
    setInput("");
    setError("");
    setShowWelcome(false);
    setSidebarOpen(false);

    void askAgent(incident.prompt, [], incident);
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();

    if (!text || loading || !activeIncident) {
      return;
    }

    void askAgent(text, messages, activeIncident);
  }

  function selectChoice(choice: Choice) {
    if (!activeIncident || loading) {
      return;
    }

    void askAgent(choice.label, messages, activeIncident);
  }

  function resetChat() {
    setActiveIncident(null);
    setMessages([]);
    setInput("");
    setError("");
    setShowWelcome(true);
    setSidebarOpen(false);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <button className="brand" onClick={resetChat} aria-label="CloudCalm home">
            <span className="brand-mark">
              <Cloud size={23} strokeWidth={2.2} />
              <span className="brand-spark">✦</span>
            </span>
            <span className="brand-name">
              cloudcalm<span>.</span>
            </span>
          </button>

          <button
            className="icon-button mobile-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <button className="new-chat-button" onClick={resetChat}>
          <MessageCircle size={17} />
          <span>New conversation</span>
          <span className="shortcut">⌘ K</span>
        </button>

        <div className="sidebar-section">
          <p className="sidebar-label">YOUR TOOLKIT</p>

          <button
            className={`nav-item ${showWelcome ? "nav-active" : ""}`}
            onClick={resetChat}
          >
            <Sparkles size={17} />
            <span>Explore CloudCalm</span>
          </button>

          <div className="nav-heading">
            <span>Quick troubleshooting</span>
          </div>

          {incidents.map((incident) => {
            const Icon = incident.icon;

            return (
              <button
                key={incident.id}
                className={`nav-item ${
                  activeIncident?.id === incident.id ? "nav-active" : ""
                }`}
                onClick={() => startIncident(incident)}
              >
                <Icon size={17} />
                <span>{incident.title}</span>
              </button>
            );
          })}
        </div>

        <div className="sidebar-spacer" />

        <div className="sidebar-note">
          <div className="note-icon">
            <Heart size={18} />
          </div>
          <p className="note-title">Cloud troubles?</p>
          <p className="note-description">
            Take a breath. We'll figure it out together.
          </p>
          <div className="note-footer">
            <span className="online-dot" />
            Here to help, 24/7
          </div>
        </div>

        <div className="sidebar-bottom">
          <div className="profile-avatar">CC</div>
          <div className="profile-info">
            <strong>CloudCalm</strong>
            <span>Your AWS companion</span>
          </div>
          <span className="version-tag">BETA</span>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={21} />
            </button>

            <div className="breadcrumb">
              <span>CloudCalm</span>
              <ChevronRight size={15} />
              <strong>
                {activeIncident ? activeIncident.title : "Home"}
              </strong>
            </div>
          </div>

          <div className="topbar-right">
            <div className="service-status">
              <span className="online-dot" />
              <span>AI assistant ready</span>
            </div>

            <div className="topbar-divider" />

            <button
              className="help-button"
              onClick={() =>
                window.open(
                  "https://docs.aws.amazon.com/",
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              <CircleHelp size={17} />
              <span>Help</span>
              <ExternalLink size={12} />
            </button>
          </div>
        </header>

        <div className="workspace">
          {!activeIncident ? (
            <WelcomeScreen
              onSelectIncident={startIncident}
              onCustomIncident={(text) => {
                startIncident({
                  id: "custom",
                  title: "Custom incident",
                  description: "Your AWS troubleshooting session",
                  icon: Terminal,
                  color: "blue",
                  prompt: text,
                  label: "Custom incident",
                });
              }}
            />
          ) : (
            <div className="chat-layout">
              <div className="chat-heading">
                <button className="back-link" onClick={resetChat}>
                  <ArrowLeft size={15} />
                  All incidents
                </button>

                <div className="incident-heading">
                  <div className={`incident-icon ${activeIncident.color}`}>
                    <activeIncident.icon size={22} />
                  </div>

                  <div>
                    <h1>{activeIncident.title}</h1>
                    <p>{activeIncident.description}</p>
                  </div>

                  <button
                    className="restart-button"
                    onClick={() => startIncident(activeIncident)}
                    title="Restart this conversation"
                  >
                    <RotateCcw size={16} />
                    <span>Restart</span>
                  </button>
                </div>
              </div>

              <div className="chat-messages">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message-row ${
                      message.role === "user" ? "message-user" : ""
                    }`}
                  >
                    {message.role === "assistant" && (
                      <div className="assistant-avatar">
                        <Cloud size={19} />
                      </div>
                    )}

                    <div className="message-content">
                      {message.role === "assistant" && (
                        <div className="message-author">
                          CloudCalm
                          <span>AI troubleshooting guide</span>
                        </div>
                      )}

                      <div className="message-bubble">
                        <p>{message.content}</p>
                      </div>

                      {message.agent && (
                        <div className="step-card">
                          <div className="step-card-header">
                            <span className="step-number">NEXT STEP</span>
                            <span className="step-indicator">
                              <Activity size={13} />
                              Guided investigation
                            </span>
                          </div>

                          <h3>{message.agent.step_title}</h3>
                          <p>{message.agent.step_description}</p>

                          {message.agent.status ===
                            "likely_cause_identified" && (
                            <div className="status-banner">
                              <CheckCircle2 size={16} />
                              A likely cause has been identified.
                            </div>
                          )}

                          {message.agent.choices.length > 0 && (
                            <div className="choice-list">
                              <span className="choice-label">
                                WHAT DO YOU SEE?
                              </span>

                              {message.agent.choices.map((choice) => (
                                <button
                                  key={choice.value}
                                  className="choice-button"
                                  onClick={() => selectChoice(choice)}
                                  disabled={loading}
                                >
                                  <span>{choice.label}</span>
                                  <ArrowRight size={16} />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {message.role === "user" && (
                        <div className="user-message-caption">
                          You <span>·</span> Just now
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="message-row">
                    <div className="assistant-avatar thinking-avatar">
                      <Cloud size={19} />
                    </div>

                    <div className="message-content">
                      <div className="message-author">
                        CloudCalm
                        <span>Thinking it through</span>
                      </div>

                      <div className="thinking-card">
                        <LoaderCircle size={17} className="spin" />
                        <span>
                          Looking for the next best step
                          <span className="thinking-dots">...</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="error-card">
                    <div className="error-icon">
                      <CircleHelp size={19} />
                    </div>

                    <div className="error-copy">
                      <strong>Let's get you back on track.</strong>
                      <p>{error}</p>
                    </div>

                    <button
                      onClick={() => {
                        if (activeIncident) {
                          void askAgent(
                            messages.at(-1)?.content || activeIncident.prompt,
                            messages.slice(0, -1),
                            activeIncident,
                          );
                        }
                      }}
                      disabled={loading}
                    >
                      Retry
                    </button>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              <div className="composer-area">
                <form className="composer" onSubmit={submitMessage}>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder="Tell me what you found, or ask a question..."
                    rows={1}
                    disabled={loading}
                    aria-label="Your troubleshooting response"
                  />

                  <button
                    type="submit"
                    className="send-button"
                    disabled={!input.trim() || loading}
                    aria-label="Send message"
                  >
                    {loading ? (
                      <LoaderCircle size={18} className="spin" />
                    ) : (
                      <Send size={18} />
                    )}
                  </button>
                </form>

                <div className="composer-footer">
                  <span>
                    <ShieldCheck size={13} />
                    Your AWS account is never accessed by this chat.
                  </span>
                  <span>Enter to send · Shift + Enter for a new line</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function WelcomeScreen({
  onSelectIncident,
  onCustomIncident,
}: {
  onSelectIncident: (incident: Incident) => void;
  onCustomIncident: (text: string) => void;
}) {
  const [customInput, setCustomInput] = useState("");

  function submitCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (customInput.trim()) {
      onCustomIncident(customInput.trim());
    }
  }

  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <div className="welcome-eyebrow">
          <span className="eyebrow-sparkle">
            <Sparkles size={14} />
          </span>
          YOUR FRIENDLY AWS TROUBLESHOOTING GUIDE
        </div>

        <h1>
          Cloud problems?
          <br />
          <span>Take a breath.</span>
        </h1>

        <p className="welcome-description">
          Something broken? You're in the right place.
          <br className="desktop-break" />
          Let's figure it out together, one step at a time.
        </p>

        <form className="welcome-input" onSubmit={submitCustom}>
          <div className="welcome-input-top">
            <div className="input-leading-icon">
              <MessageCircle size={20} />
            </div>

            <textarea
              value={customInput}
              onChange={(event) => setCustomInput(event.target.value)}
              placeholder="Tell me what's going wrong with your AWS setup..."
              rows={2}
              aria-label="Describe your AWS problem"
            />

            <button
              type="submit"
              disabled={!customInput.trim()}
              aria-label="Start troubleshooting"
            >
              <ArrowRight size={20} />
            </button>
          </div>

          <div className="welcome-input-footer">
            <span>
              <span className="online-dot" />
              No judgment. Just solutions.
            </span>
            <span>↵ Start a conversation</span>
          </div>
        </form>

        <div className="quick-section">
          <div className="quick-heading">
            <div>
              <span className="section-kicker">QUICK START</span>
              <h2>What's giving you trouble?</h2>
            </div>

            <span className="quick-count">03 COMMON ISSUES</span>
          </div>

          <div className="incident-grid">
            {incidents.map((incident, index) => {
              const Icon = incident.icon;

              return (
                <button
                  key={incident.id}
                  className={`incident-card incident-${incident.color}`}
                  onClick={() => onSelectIncident(incident)}
                >
                  <div className="incident-card-top">
                    <div className={`incident-icon ${incident.color}`}>
                      <Icon size={22} />
                    </div>
                    <span className="incident-arrow">
                      <ArrowRight size={17} />
                    </span>
                  </div>

                  <span className="incident-category">
                    0{index + 1} / {incident.label}
                  </span>

                  <h3>{incident.title}</h3>
                  <p>{incident.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="reassurance-strip">
          <div className="reassurance-icon">
            <Heart size={18} />
          </div>

          <div>
            <strong>Made for humans, not just cloud engineers.</strong>
            <p>
              No jargon overload. No blame. Just clear next steps.
            </p>
          </div>

          <div className="reassurance-badge">
            <CheckCircle2 size={15} />
            Beginner friendly
          </div>
        </div>
      </div>

      <footer className="welcome-footer">
        <span>
          <Cloud size={15} />
          CloudCalm
        </span>
        <span>Built for calmer cloud days.</span>
        <span>Powered by Amazon Bedrock</span>
      </footer>
    </div>
  );
}

export default App;