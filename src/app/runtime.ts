import { CommandBus } from "../state/commands";
import { loadSnapshot, saveSnapshot } from "../state/snapshot";
import { createStore } from "../state/store";

export const store = createStore(loadSnapshot());

export const commandBus = new CommandBus({
  getState: store.getState,
  applyEvents: (events) => {
    store.applyEvents(events);
    saveSnapshot(store.getState());
  },
});
