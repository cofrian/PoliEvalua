import { Composition, registerRoot } from "remotion";
import { createElement } from "react";

import { DURATION, Promo } from "./Promo";

registerRoot(() =>
  createElement(Composition, { id: "Promo", component: Promo, durationInFrames: DURATION, fps: 30, width: 1920, height: 1080 }),
);
