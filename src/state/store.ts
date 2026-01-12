import type { AppState } from "../domain/types";
import type { DomainEvent } from "./events";
import { reducer } from "./reducer";
import { debugLog, isDebugEnabled } from "../debug/logger";

export type Selector<T> = (state: AppState) => T;
export type EqualityFn<T> = (a: T, b: T) => boolean;
export type Listener<T> = (value: T, previous: T) => void;

interface Subscription<T> {
  selector: Selector<T>;
  listener: Listener<T>;
  equalityFn: EqualityFn<T>;
  lastValue: T;
}

export function createStore(initialState: AppState) {
  let state = initialState;
  const subscriptions: Subscription<unknown>[] = [];

  function getState() {
    return state;
  }

  function applyEvents(events: DomainEvent[]) {
    const prevRoute = state.ui.route;
    let next = state;
    for (const event of events) {
      next = reducer(next, event);
    }
    const previous = state;
    state = next;

    if (isDebugEnabled()) {
      const nextRoute = state.ui.route;
      debugLog("log", "store:applyEvents", {
        events: events.map((e) => e.type),
        prevRoute,
        nextRoute,
      });
    }

    subscriptions.forEach((subscription) => {
      const nextSelected = subscription.selector(state);
      const prevSelected = subscription.lastValue;
      if (!subscription.equalityFn(nextSelected, prevSelected)) {
        subscription.lastValue = nextSelected;
        subscription.listener(nextSelected, prevSelected);
      }
    });
    return { previous, next };
  }

  function subscribe<T>(
    selector: Selector<T>,
    listener: Listener<T>,
    equalityFn: EqualityFn<T> = Object.is
  ) {
    const subscription: Subscription<T> = {
      selector,
      listener,
      equalityFn,
      lastValue: selector(state),
    };
    subscriptions.push(subscription as Subscription<unknown>);

    return () => {
      const index = subscriptions.indexOf(subscription as Subscription<unknown>);
      if (index >= 0) {
        subscriptions.splice(index, 1);
      }
    };
  }

  return {
    getState,
    applyEvents,
    subscribe,
  };
}
