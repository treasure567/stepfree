"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Check,
  Clock3,
  LoaderCircle,
  LogOut,
  MapPinned,
  Route,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { EmailVerificationPanel } from "@/features/account/email-verification-panel";
import type {
  AccountProfile,
  MobilityMode,
} from "@/features/account/types";

const mobilityOptions: Array<{
  value: MobilityMode;
  title: string;
  description: string;
}> = [
  {
    value: "wheelchair",
    title: "Wheelchair",
    description: "Reject stairs and routes without step-free access",
  },
  {
    value: "mobility-aid",
    title: "Mobility aid",
    description: "Prefer lifts, shorter walking, and fewer changes",
  },
  {
    value: "limited-walking",
    title: "Limited walking",
    description: "Keep walking distance within your saved limit",
  },
];

export function ProfileEditor({ profile }: { profile: AccountProfile }) {
  const stations = useQuery(api.routes.listStations);
  const recentJourneys = useQuery(api.users.recentJourneys);
  const updateProfile = useMutation(api.users.updateProfile);
  const { signOut } = useAuthActions();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [mobilityMode, setMobilityMode] = useState(profile.mobilityMode);
  const [needsStepFreeToTrain, setNeedsStepFreeToTrain] = useState(
    profile.needsStepFreeToTrain,
  );
  const [avoidsStairs, setAvoidsStairs] = useState(profile.avoidsStairs);
  const [prefersFewerChanges, setPrefersFewerChanges] = useState(
    profile.prefersFewerChanges,
  );
  const [maxWalkingMinutes, setMaxWalkingMinutes] = useState(
    profile.maxWalkingMinutes,
  );
  const [homeStationSlug, setHomeStationSlug] = useState(
    profile.homeStationSlug ?? "",
  );
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState("saving");
    setError("");

    try {
      await updateProfile({
        displayName,
        mobilityMode,
        needsStepFreeToTrain,
        avoidsStairs,
        prefersFewerChanges,
        maxWalkingMinutes,
        homeStationSlug: homeStationSlug || undefined,
      });
      setSaveState("saved");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save your profile.",
      );
      setSaveState("error");
    }
  }

  return (
    <div className="profile-layout">
      <div className="profile-main-column">
        <div className="profile-heading">
          <div>
            <span>Account</span>
            <h1>{profile.displayName}</h1>
            <p>@{profile.username}</p>
          </div>
          <button type="button" onClick={() => void signOut()}>
            <LogOut aria-hidden="true" /> Sign out
          </button>
        </div>

        <EmailVerificationPanel profile={profile} />

        <section className="profile-card" aria-labelledby="profile-title">
          <div className="profile-section-heading">
            <h2 id="profile-title">Accessibility preferences</h2>
            <p>These settings are applied before a route is accepted.</p>
          </div>

          <form onSubmit={save}>
            <label className="profile-field">
              <span>Display name</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                minLength={2}
                maxLength={40}
                required
              />
            </label>

            <fieldset className="mobility-options">
              <legend>Mobility profile</legend>
              {mobilityOptions.map((option) => (
                <label
                  className={mobilityMode === option.value ? "is-selected" : ""}
                  key={option.value}
                >
                  <input
                    type="radio"
                    name="mobility-mode"
                    value={option.value}
                    checked={mobilityMode === option.value}
                    onChange={() => setMobilityMode(option.value)}
                  />
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.description}</small>
                  </span>
                  <Check aria-hidden="true" />
                </label>
              ))}
            </fieldset>

            <div className="preference-grid">
              <label>
                <input
                  type="checkbox"
                  checked={needsStepFreeToTrain}
                  onChange={(event) =>
                    setNeedsStepFreeToTrain(event.target.checked)
                  }
                />
                <span>
                  <strong>Step-free to the train</strong>
                  <small>Not only to the platform</small>
                </span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={avoidsStairs}
                  onChange={(event) => setAvoidsStairs(event.target.checked)}
                />
                <span>
                  <strong>Avoid stairs</strong>
                  <small>Reject routes with stair segments</small>
                </span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={prefersFewerChanges}
                  onChange={(event) =>
                    setPrefersFewerChanges(event.target.checked)
                  }
                />
                <span>
                  <strong>Prefer fewer changes</strong>
                  <small>Allow more time for a simpler trip</small>
                </span>
              </label>
            </div>

            <div className="profile-two-column">
              <label className="profile-field">
                <span>Maximum walking time</span>
                <div className="walking-control">
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={maxWalkingMinutes}
                    onChange={(event) =>
                      setMaxWalkingMinutes(Number(event.target.value))
                    }
                  />
                  <strong>{maxWalkingMinutes} min</strong>
                </div>
              </label>
              <label className="profile-field">
                <span>Home station</span>
                <select
                  value={homeStationSlug}
                  onChange={(event) => setHomeStationSlug(event.target.value)}
                >
                  <option value="">Choose later</option>
                  {(stations ?? []).map((station) => (
                    <option value={station.slug} key={station.id}>
                      {station.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {error ? <p className="account-error" role="alert">{error}</p> : null}
            <div className="profile-save-row">
              <span>Changes apply to your next route.</span>
              <button type="submit" disabled={saveState === "saving"}>
                {saveState === "saving" ? (
                  <LoaderCircle className="spin" aria-hidden="true" />
                ) : null}
                {saveState === "saving"
                  ? "Saving"
                  : saveState === "saved"
                    ? "Saved"
                    : "Save changes"}
              </button>
            </div>
          </form>
        </section>
      </div>

      <aside className="journey-history" aria-labelledby="journey-history-title">
        <div className="journey-history-heading">
          <Clock3 aria-hidden="true" />
          <div>
            <span>Recent activity</span>
            <h2 id="journey-history-title">Your routes</h2>
          </div>
        </div>
        {recentJourneys === undefined ? (
          <LoaderCircle className="spin" aria-hidden="true" />
        ) : recentJourneys.length > 0 ? (
          <div className="journey-history-list">
            {recentJourneys.map((journey) => (
              <article key={journey.id}>
                <Route aria-hidden="true" />
                <div>
                  <strong>{journey.fromName} to {journey.toName}</strong>
                  <span>{journey.durationMinutes} min · {journey.status}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="journey-history-empty">
            <MapPinned aria-hidden="true" />
            <strong>No saved routes</strong>
            <p>Your planned transit routes will appear here.</p>
          </div>
        )}
        <Link href="/navigate">
          Open navigator <ArrowRight aria-hidden="true" />
        </Link>
      </aside>
    </div>
  );
}
