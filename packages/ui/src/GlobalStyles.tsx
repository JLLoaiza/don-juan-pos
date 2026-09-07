import { tokensCss } from "./tokens.js";

export function GlobalStyles() {
  return <style data-testid="dj-global-styles">{tokensCss}</style>;
}
