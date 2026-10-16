"use client";

import { useRef, useState } from "react";

import { FaqItem } from "@/components/ui/faq-accordion";
import {
  HELP_PAGE,
  HELP_QUESTIONS,
  HELP_TOPICS,
  type HelpTopic,
} from "@/content/public/help";

/**
 * The Help page's in-page FAQ filter (prototype/pages/help/index.html with prototype/shared/pending.js,
 * ported — never imported): a word filter over each question's text and a topic select, the live count,
 * the empty line and a reset that refocuses the search. Every question renders without JavaScript.
 */
export function FaqFilter() {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<"" | HelpTopic>("");
  const search = useRef<HTMLInputElement>(null);

  const needle = query.trim().toLowerCase();
  const visible = HELP_QUESTIONS.map((item) => {
    const text = `${item.topic}${item.q}${item.a}`.toLowerCase();
    return text.includes(needle) && (topic === "" || item.topic === topic);
  });
  const count = visible.filter(Boolean).length;

  const reset = () => {
    setQuery("");
    setTopic("");
    search.current?.focus();
  };

  return (
    <>
      <div className="utility-filters">
        <label>
          {HELP_PAGE.searchLabel}
          <input
            type="search"
            id="faq-search"
            placeholder={HELP_PAGE.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            ref={search}
          />
        </label>
        <label>
          {HELP_PAGE.topicLabel}
          <select
            id="faq-topic"
            value={topic}
            onChange={(e) => setTopic(e.currentTarget.value as "" | HelpTopic)}
          >
            <option value="">{HELP_PAGE.allTopics}</option>
            {HELP_TOPICS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <button
          className="button button--secondary"
          id="faq-reset"
          type="button"
          onClick={reset}
        >
          {HELP_PAGE.reset}
        </button>
      </div>
      <p id="faq-status" role="status">
        {HELP_PAGE.status(count)}
      </p>
      <div id="questions">
        {HELP_QUESTIONS.map((item, i) => {
          const first =
            HELP_QUESTIONS.findIndex((q) => q.topic === item.topic) === i;
          return (
            <div data-topic={item.topic} key={item.q} hidden={!visible[i]}>
              {first ? <h2 className="help-topic">{item.topic}</h2> : null}
              <FaqItem
                question={item.q}
                answer={item.a}
                className="utility-faq"
              />
            </div>
          );
        })}
      </div>
      <p id="faq-empty" hidden={count > 0}>
        {HELP_PAGE.empty}
      </p>
    </>
  );
}
