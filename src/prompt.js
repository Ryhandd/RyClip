import readline from 'node:readline/promises';

// Tidak bergantung pada stdin.isTTY (Git Bash/mintty melaporkan non-TTY padahal interaktif).
// stdin tertutup (EOF / terminal tidak meneruskan input) → resolve null dan tidak pernah menggantung.
let closed = false;
export const isStdinClosed = () => closed;

export function ask(question, { input = process.stdin, output = process.stdout } = {}) {
  if (closed) return Promise.resolve(null);
  const rl = readline.createInterface({ input, output });
  return new Promise((resolve) => {
    let answered = false;
    rl.once('close', () => {
      if (!answered) closed = true; // EOF sebelum ada jawaban
      resolve(null);
    });
    rl.question(question).then(
      (ans) => {
        answered = true;
        resolve(ans.trim() || null);
        rl.close();
      },
      () => {}, // ditutup sebelum dijawab → ditangani handler 'close'
    );
  });
}
