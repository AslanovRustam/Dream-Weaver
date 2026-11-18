// Реестр планов движка ТЗ: инструмент → что решать сверх общей части задания.
// Каждый инструмент правит только свой файл плана.
import { plan as campaign } from "./campaign";
import { plan as email } from "./email";
import { plan as gif } from "./gif";
import { plan as landing } from "./landing";
import { plan as playable } from "./playable";
import type { TzPlanSpec, TzProduct } from "./types";

const banner: TzPlanSpec = {
  tool: "static advertising banner (one master per distinct creative) + resizes to every requested size",
  banners: true,
  planInstructions: "",
  planShape: "",
};

export const TZ_PLANS: Record<TzProduct, TzPlanSpec> = {
  banner,
  bannerLayers: banner,
  gif,
  landing,
  playable,
  email,
  campaign,
};

export type { TzPlanSpec, TzProduct } from "./types";
export { TZ_PRODUCTS } from "./types";
