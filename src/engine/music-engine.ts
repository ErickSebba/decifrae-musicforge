export interface PracticeInputProvider {
  onNoteInput: (callback: (note: string) => void) => void;
  dispose: () => void;
}

// Fase 1: implementação real via teclado/mouse
export class KeyboardMouseInput implements PracticeInputProvider {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onNoteInput(_callback: (note: string) => void) {}
  dispose() {}
}
