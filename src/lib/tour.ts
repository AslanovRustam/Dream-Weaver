// Interactive product tour — the steps, and nothing else. The provider
// (components/tour/TourProvider.tsx) renders them; the screens themselves only
// carry `data-tour="<target>"` attributes, so a step can never drag app code
// into its own logic.
//
// A step is finished by the user actually doing the thing:
//   click  — they clicked inside the highlighted element (auto-advances)
//   input  — they typed into it; «Далее» unlocks once there is enough text
//   manual — read and press «Далее»
// Every step can still be skipped, so nobody is ever trapped in the tour.

export const TOUR_STORAGE_KEY = "dw_tour_v1";

export type TourAction =
  | { type: "manual" }
  | { type: "click" }
  | { type: "input"; min: number };

export type TourStep = {
  id: string;
  /** Where «Перейти» sends you when you are somewhere else entirely. */
  route: string;
  /** Extra pathname prefixes where the step is also at home. The landing
   *  builders each have their own route (/wheel, /slot, /crash, /match), so a
   *  landing step must accept all of them, not just /landing. */
  also?: string[];
  /** `data-tour` value of the element to highlight. Omitted = centred card. */
  target?: string;
  title: string;
  body: string;
  action: TourAction;
  /** Shown while the action is still undone. */
  hint?: string;
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: "tpl-search",
    route: "/banner/templates",
    target: "tpl-search",
    title: "Каталог шаблонов",
    body: "Шаблон задаёт стиль креатива и набор полей под него. Поиск ищет по названию — например, «слот» или «бонус».",
    action: { type: "manual" },
  },
  {
    id: "tpl-filter",
    route: "/banner/templates",
    target: "tpl-filter",
    title: "Фильтр по категории",
    body: "Воронка сужает список до нужной вертикали: казино, слоты, спорт, ставки. Снять фильтр можно там же.",
    action: { type: "manual" },
  },
  {
    id: "tpl-pick",
    route: "/banner/templates",
    target: "tpl-tile",
    title: "Выберите шаблон",
    body: "Нажмите на любую плитку. Откроется генератор, и набор полей подстроится под этот шаблон.",
    action: { type: "click" },
    hint: "Нажмите на шаблон, чтобы продолжить",
  },
  {
    id: "banner-prompt",
    route: "/banner",
    target: "banner-prompt",
    title: "Опишите оффер",
    body: "Одним предложением: что рекламируем и чем цепляем. Например, «200% на первый депозит и 500 фриспинов».",
    action: { type: "input", min: 12 },
    hint: "Напишите хотя бы пару слов",
  },
  {
    id: "banner-brand",
    route: "/banner",
    target: "banner-brand",
    title: "Добавьте бренд",
    body: "Название проекта и PNG-лого. Прозрачность сохраняется, лого встаёт в макет, а не ложится поверх прямоугольником.",
    action: { type: "manual" },
  },
  {
    id: "banner-generate",
    route: "/banner",
    target: "banner-generate",
    title: "Запустите генерацию",
    body: "На кнопке написано, сколько кредитов спишется. Первым придёт мастер-макет — большой горизонтальный баннер.",
    action: { type: "click" },
    hint: "Нажмите «Сгенерировать», чтобы продолжить",
  },
  {
    id: "banner-resizes",
    route: "/banner",
    target: "banner-resizes",
    title: "Соберите форматы",
    body: "После мастера появляется панель ресайзов: отметьте нужные размеры и запустите пакет. Каждый формат перерисовывается под свой холст, а не обрезается.",
    action: { type: "manual" },
  },
  {
    id: "landing-pick",
    route: "/landing",
    target: "landing-templates",
    title: "Выберите механику лендинга",
    body: "Колесо, слот-машина, crash, матч-прогноз или классический беттинг-лендинг. Механика определяет, что будет в центре экрана.",
    action: { type: "click" },
    hint: "Выберите шаблон лендинга, чтобы продолжить",
  },
  {
    id: "landing-topic",
    route: "/landing",
    also: ["/wheel", "/slot", "/crash", "/match"],
    target: "landing-topic",
    title: "Опишите тематику",
    body: "Единственное обязательное поле: по нему собирается весь текст страницы. Кнопки со звёздочкой у полей подставят готовые варианты.",
    action: { type: "input", min: 10 },
    hint: "Опишите тематику, чтобы продолжить",
  },
  {
    id: "landing-preview",
    route: "/landing",
    also: ["/wheel", "/slot", "/crash", "/match"],
    target: "landing-preview",
    title: "Проверьте на весь экран",
    body: "Откроется настоящий экспорт в рамке. Ширину можно тянуть мышью, кнопка «Повернуть» меняет ориентацию.",
    action: { type: "click" },
    hint: "Откройте предпросмотр, чтобы продолжить",
  },
  {
    id: "landing-export",
    route: "/landing",
    also: ["/wheel", "/slot", "/crash", "/match"],
    target: "landing-export",
    title: "Заберите HTML",
    body: "Закройте предпросмотр клавишей Esc и нажмите «Скачать HTML». Файл самодостаточный: картинки внутри, ничего не подгружается со стороны.",
    action: { type: "click" },
    hint: "Нажмите «Скачать HTML», чтобы завершить",
  },
  {
    id: "done",
    route: "/landing",
    also: ["/wheel", "/slot", "/crash", "/match"],
    title: "Готово",
    body: "Вы прошли весь путь: шаблон, баннер с форматами и лендинг. Все проекты лежат в «Истории» — туда можно вернуться и догенерировать что угодно.",
    action: { type: "manual" },
  },
];

export const TOUR_TOTAL = TOUR_STEPS.length;
