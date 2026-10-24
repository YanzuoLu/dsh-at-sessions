window.__ModuleLoader__.load({
  id: 'dsh-at-sessions',
  factory: (require) => {
    'use strict';
    const { symbols } = require('@deepseek-ai/cordis');

    /** Restore only a method still owned by this effect. */
    function restoreMethod(target, name, wrapper, descriptor) {
      if (Object.getOwnPropertyDescriptor(target, name)?.value !== wrapper) return;
      if (descriptor === undefined) delete target[name];
      else Object.defineProperty(target, name, descriptor);
    }

    /** Restrict discovery without replacing reference owners or their codecs. */
    function apply(ctx) {
      const service = ctx.get('inputTriggers');
      const registry = service[symbols.original] ?? service;
      const workspaces = ctx.get('workspaces');
      const live = registry.live;
      // DSH 0.2.0-rc.2 exposes registration, but not roster interception.
      if (!Array.isArray(live?.sources)
        || typeof live.controllers?.values?.[Symbol.iterator] !== 'function'
        || typeof registry.registerSource !== 'function') {
        throw new Error('dsh-at-sessions requires the DSH 0.2.0-rc.2 input-trigger registry');
      }

      ctx.effect(() => {
        let active = true;
        const records = new WeakMap();
        const references = new Set();
        const readinessWaiters = new Set();
        const descriptor = Object.getOwnPropertyDescriptor(registry, 'registerSource');
        const originalRegister = registry.registerSource;
        let snapshot = workspaces.list.getSnapshot();
        let archives = snapshot.archivedSessionIds;
        let phase = snapshot.phase;

        function waitUntilReady(signal) {
          signal.throwIfAborted();
          if (!active || workspaces.list.getSnapshot().phase === 'ready') return Promise.resolve();
          return new Promise((resolve, reject) => {
            const cleanup = () => {
              signal.removeEventListener('abort', abort);
              readinessWaiters.delete(wake);
            };
            const abort = () => {
              cleanup();
              reject(signal.reason);
            };
            const wake = () => {
              if (active && workspaces.list.getSnapshot().phase !== 'ready') return;
              cleanup();
              resolve();
            };
            readinessWaiters.add(wake);
            signal.addEventListener('abort', abort, { once: true });
            if (signal.aborted) abort();
            else wake();
          });
        }

        function restoreSource(source) {
          const record = records.get(source);
          if (record === undefined) return;
          record.active = false;
          restoreMethod(source, 'candidates', record.wrapper, record.descriptor);
          references.delete(record.reference);
          records.delete(source);
        }

        function wrapSource(source) {
          if (source.trigger !== '@' || records.has(source)) return false;
          const original = source.candidates;
          const referenceSource = source.name === 'reference';
          const record = {
            active: true,
            descriptor: Object.getOwnPropertyDescriptor(source, 'candidates'),
            reference: new WeakRef(source),
            wrapper: undefined,
          };
          record.wrapper = async function candidates(session, request) {
            if (!active || !record.active) return original.call(this, session, request);
            if (!referenceSource) return [];
            await waitUntilReady(request.signal);
            if (!active || !record.active) return original.call(this, session, request);
            request.signal.throwIfAborted();
            // Keep server-selected eligibility, native ordering, RPCs, and insertion payloads.
            const items = await original.call(this, session, request);
            if (!active || !record.active) return items;
            request.signal.throwIfAborted();
            return items.filter((item) => item.value !== undefined
              && JSON.parse(item.value)?.kind === 'session');
          };
          source.candidates = record.wrapper;
          records.set(source, record);
          references.add(record.reference);
          return true;
        }

        /** Invalidate visible rows and supersede their fetch without dismissing the hit. */
        function refreshOpenAtMenus(reseed = false) {
          for (const controller of live.controllers.values) {
            const state = controller.menu.getSnapshot();
            if (!state.open || state.hit?.trigger !== '@') continue;
            let groups = state.groups;
            if (reseed) {
              // sourceAdded warms sources but does not seed an already-open menu.
              const launched = controller.launcher.getSnapshot();
              groups = live.sources
                .filter((source) => source.trigger === '@'
                  && (launched === null || source.name === launched))
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .map((source) => ({
                  source: source.name,
                  ...(source.showGroupTitle === false ? { showGroupTitle: false } : {}),
                }));
            }
            controller.menu.set({
              ...state,
              groups: groups.map((group) => ({ ...group, status: 'pending', items: [] })),
              highlight: null,
            });
            controller.refreshOpenMenu();
          }
          for (const reference of references) {
            if (reference.deref() === undefined) references.delete(reference);
          }
        }

        function registerSource(source) {
          if (!active || source.trigger !== '@') return originalRegister.call(this, source);
          const wrapped = wrapSource(source);
          let unregister;
          try {
            unregister = originalRegister.call(this, source);
          } catch (error) {
            if (wrapped && !live.sources.includes(source)) restoreSource(source);
            throw error;
          }
          if (source.trigger === '@') refreshOpenAtMenus(true);
          return function disposeSource(...args) {
            try {
              return unregister.apply(this, args);
            } finally {
              if (!live.sources.includes(source)) restoreSource(source);
            }
          };
        }

        let unsubscribe;
        function cleanup() {
          if (!active) return;
          active = false;
          unsubscribe?.();
          restoreMethod(registry, 'registerSource', registerSource, descriptor);
          for (const reference of references) {
            const source = reference.deref();
            if (source !== undefined) restoreSource(source);
          }
          references.clear();
          for (const wake of readinessWaiters) wake();
          refreshOpenAtMenus();
        }

        try {
          registry.registerSource = registerSource;
          for (const source of live.sources) wrapSource(source);
          unsubscribe = workspaces.list.subscribe(() => {
            snapshot = workspaces.list.getSnapshot();
            const changed = archives !== snapshot.archivedSessionIds || phase !== snapshot.phase;
            archives = snapshot.archivedSessionIds;
            phase = snapshot.phase;
            for (const wake of readinessWaiters) wake();
            if (changed) refreshOpenAtMenus();
          });
          refreshOpenAtMenus();
        } catch (error) {
          cleanup();
          throw error;
        }
        return cleanup;
      }, 'dsh-at-sessions: @ candidate policy');
    }

    return { inject: ['inputTriggers', 'workspaces'], apply };
  },
});
