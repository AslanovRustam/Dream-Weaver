// Lightweight global undo/redo for the editor's settings.
//
// The editor (ImageGenApp) registers a getState/setState pair once, then
// calls record() — debounced — after user edits. The header's Undo/Redo
// buttons call undo()/redo(). Snapshots are plain serialisable objects
// compared by JSON, which is enough for the form's text/toggle fields.
//
// Lives above both the header and the editor (mounted in providers.tsx) so
// the two can share one history even though they're in different subtrees.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

export type Snapshot = Record<string, unknown>;

type EditorApi = { getState: () => Snapshot; setState: (s: Snapshot) => void };

type EditorHistoryValue = {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  register: (api: EditorApi) => void;
  record: () => void;
  reset: (seed?: Snapshot) => void;
};

const EditorHistoryContext = createContext<EditorHistoryValue | null>(null);

const MAX_HISTORY = 60;

export function EditorHistoryProvider({ children }: { children: ReactNode }) {
  const apiRef = useRef<EditorApi | null>(null);
  const presentRef = useRef<Snapshot | null>(null);
  const pastRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  // Set right before an undo/redo applies a snapshot, so the editor's own
  // debounced record() (which fires from the resulting state change) skips
  // that one push instead of corrupting the stacks.
  const applyingRef = useRef(false);
  const [, bump] = useReducer((x: number) => x + 1, 0);

  const register = useCallback((api: EditorApi) => {
    apiRef.current = api;
    if (presentRef.current === null) presentRef.current = api.getState();
  }, []);

  const record = useCallback(() => {
    if (!apiRef.current) return;
    if (applyingRef.current) {
      applyingRef.current = false;
      return;
    }
    const s = apiRef.current.getState();
    if (presentRef.current && JSON.stringify(s) === JSON.stringify(presentRef.current)) return;
    if (presentRef.current) {
      pastRef.current = [...pastRef.current, presentRef.current].slice(-MAX_HISTORY);
    }
    presentRef.current = s;
    futureRef.current = [];
    bump();
  }, []);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0 || !apiRef.current) return;
    const prev = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    if (presentRef.current) futureRef.current = [presentRef.current, ...futureRef.current];
    presentRef.current = prev;
    applyingRef.current = true;
    apiRef.current.setState(prev);
    bump();
  }, []);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0 || !apiRef.current) return;
    const next = futureRef.current[0];
    futureRef.current = futureRef.current.slice(1);
    if (presentRef.current) pastRef.current = [...pastRef.current, presentRef.current];
    presentRef.current = next;
    applyingRef.current = true;
    apiRef.current.setState(next);
    bump();
  }, []);

  const reset = useCallback((seed?: Snapshot) => {
    pastRef.current = [];
    futureRef.current = [];
    presentRef.current = seed ?? apiRef.current?.getState() ?? null;
    bump();
  }, []);

  const value = useMemo<EditorHistoryValue>(
    () => ({
      canUndo: pastRef.current.length > 0,
      canRedo: futureRef.current.length > 0,
      undo,
      redo,
      register,
      record,
      reset,
    }),
    // Re-derive the flags whenever the stacks change (bump() forces the render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [undo, redo, register, record, reset, pastRef.current.length, futureRef.current.length],
  );

  return <EditorHistoryContext.Provider value={value}>{children}</EditorHistoryContext.Provider>;
}

export function useEditorHistory() {
  const v = useContext(EditorHistoryContext);
  if (!v) throw new Error("useEditorHistory must be used inside <EditorHistoryProvider>");
  return v;
}
