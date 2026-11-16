import {
  RESET,
  BRIGHT,
  CYAN,
  GREEN,
  MAGENTA,
  YELLOW,
  RED,
} from "../config";

export { RESET, BRIGHT, CYAN, GREEN, MAGENTA, YELLOW, RED };

export function logTick(symbol: string, price: string) {
  console.log(
    `${CYAN}[TICK]${RESET} ${symbol.padEnd(8)} | Price: ${BRIGHT}${price}${RESET}`,
  );
}

export function logStateUpdate(key: string, value: string) {
  console.log(
    `  ${GREEN}➔ [STATE UPDATE]${RESET} markPrices ➔ ${MAGENTA}${key}${RESET}: ${GREEN}${value}${RESET}`,
  );
}
