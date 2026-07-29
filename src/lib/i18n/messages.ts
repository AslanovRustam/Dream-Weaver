import type { Locale } from "./config";

// Interface-copy dictionary. RU is the source of truth; EN and UK are typed as
// `Messages`, so TypeScript flags any missing key at build time. Scope for now:
// header + menus (the chrome). Page bodies / generators / admin are localised
// incrementally in follow-up work — untranslated screens simply stay Russian.
//
// Interpolation: use "{name}" placeholders and pass vars to t(): e.g.
//   t("header.projects.updated", { date }).

const ru = {
  header: {
    home: "На главную",
    homeAria: "Dream Weaver Studio — на главную",
    uploadFailed: "{n} файлов не сохранены в облаке. Откройте историю.",
    credits: {
      title: "Кредиты",
      label: "Кредиты:",
      low: "Кредиты заканчиваются — пополнить",
      topUp: "Пополнить кредиты",
      more: "Больше кредитов",
      topUpShort: "Пополнить",
    },
    notifications: {
      title: "Уведомления",
      empty: "Новых уведомлений нет",
      items: [
        {
          title: "Генерация завершена",
          desc: "Пакет из 6 баннеров готов к скачиванию",
          time: "2 мин",
        },
        { title: "Новый шаблон добавлен", desc: "Betting · «Экспресс дня»", time: "1 ч" },
        { title: "Аккаунт активен", desc: "Текущий план: Бесплатный", time: "вчера" },
      ],
    },
    help: {
      trigger: "Помощь",
      kb: "База знаний и FAQ",
      contact: "Написать в поддержку",
    },
    projects: {
      trigger: "Мои проекты",
      all: "Вся история",
      updated: "Изменён {date}",
    },
    profile: {
      trigger: "Профиль",
      account: "Аккаунт",
      history: "История",
      help: "Помощь и поддержка",
      admin: "Админ-панель",
      signOut: "Выйти",
    },
    guest: {
      login: "Войти",
      register: "Регистрация",
    },
    language: {
      aria: "Язык интерфейса",
      title: "Язык интерфейса",
      hint: "Меняет язык интерфейса продукта.",
    },
    sections: {
      switch: "Переключить раздел",
      all: "Разделы",
      coach:
        "Здесь можно переключаться между Баннер-генератором, Лендинг-генератором и другими инструментами.",
      coachOk: "Понятно",
    },
    project: {
      untitled: "Проект без названия",
      rename: "Переименовать проект",
    },
    progress: {
      error: "Ошибка",
      master: "Мастер",
      done: "Готово",
      open: "Открыть страницу генерации",
      abort: "Прервать",
      hide: "Скрыть",
      abortAll: "Прервать оставшиеся задачи",
      hideIndicator: "Скрыть индикатор",
    },
    unsaved: "Есть несохранённые изменения. Продолжить?",
    unsavedModal: {
      title: "Несохранённые изменения",
      body: "У вас есть несохранённые изменения. Если вы продолжите, они будут потеряны.",
      stay: "Остаться",
      leave: "Продолжить без сохранения",
    },
  },
  workspace: {
    switch: "Мой Workspace",
    all: "Мои пространства",
    manage: "Управление пространствами",
  },
};

export type Messages = {
  header: {
    home: string;
    homeAria: string;
    uploadFailed: string;
    credits: {
      title: string;
      label: string;
      low: string;
      topUp: string;
      more: string;
      topUpShort: string;
    };
    notifications: {
      title: string;
      empty: string;
      items: { title: string; desc: string; time: string }[];
    };
    help: { trigger: string; kb: string; contact: string };
    projects: { trigger: string; all: string; updated: string };
    profile: {
      trigger: string;
      account: string;
      history: string;
      help: string;
      admin: string;
      signOut: string;
    };
    guest: { login: string; register: string };
    language: { aria: string; title: string; hint: string };
    sections: { switch: string; all: string; coach: string; coachOk: string };
    project: { untitled: string; rename: string };
    progress: {
      error: string;
      master: string;
      done: string;
      open: string;
      abort: string;
      hide: string;
      abortAll: string;
      hideIndicator: string;
    };
    unsaved: string;
    unsavedModal: { title: string; body: string; stay: string; leave: string };
  };
  workspace: { switch: string; all: string; manage: string };
};

const en: Messages = {
  header: {
    home: "Home",
    homeAria: "Dream Weaver Studio — home",
    uploadFailed: "{n} files were not saved to the cloud. Open History.",
    credits: {
      title: "Credits",
      label: "Credits:",
      low: "Credits are running low — top up",
      topUp: "Top up credits",
      more: "More credits",
      topUpShort: "Top up",
    },
    notifications: {
      title: "Notifications",
      empty: "No new notifications",
      items: [
        { title: "Generation finished", desc: "A pack of 6 banners is ready to download", time: "2 min" },
        { title: "New template added", desc: "Betting · “Express of the day”", time: "1 h" },
        { title: "Account active", desc: "Current plan: Free", time: "yesterday" },
      ],
    },
    help: {
      trigger: "Help",
      kb: "Knowledge base & FAQ",
      contact: "Contact support",
    },
    projects: {
      trigger: "My projects",
      all: "All history",
      updated: "Edited {date}",
    },
    profile: {
      trigger: "Profile",
      account: "Account",
      history: "History",
      help: "Help & support",
      admin: "Admin panel",
      signOut: "Sign out",
    },
    guest: {
      login: "Sign in",
      register: "Sign up",
    },
    language: {
      aria: "Interface language",
      title: "Interface language",
      hint: "Changes the product interface language.",
    },
    sections: {
      switch: "Switch section",
      all: "Sections",
      coach:
        "Switch between the Banner generator, Landing generator and other tools here.",
      coachOk: "Got it",
    },
    project: {
      untitled: "Untitled project",
      rename: "Rename project",
    },
    progress: {
      error: "Error",
      master: "Master",
      done: "Done",
      open: "Open the generation page",
      abort: "Abort",
      hide: "Hide",
      abortAll: "Abort remaining tasks",
      hideIndicator: "Hide the indicator",
    },
    unsaved: "You have unsaved changes. Continue?",
    unsavedModal: {
      title: "Unsaved changes",
      body: "You have unsaved changes. If you continue, they will be lost.",
      stay: "Stay",
      leave: "Leave without saving",
    },
  },
  workspace: {
    switch: "My Workspace",
    all: "My workspaces",
    manage: "Manage workspaces",
  },
};

const uk: Messages = {
  header: {
    home: "На головну",
    homeAria: "Dream Weaver Studio — на головну",
    uploadFailed: "{n} файлів не збережено в хмарі. Відкрийте Історію.",
    credits: {
      title: "Кредити",
      label: "Кредити:",
      low: "Кредити закінчуються — поповнити",
      topUp: "Поповнити кредити",
      more: "Більше кредитів",
      topUpShort: "Поповнити",
    },
    notifications: {
      title: "Сповіщення",
      empty: "Нових сповіщень немає",
      items: [
        { title: "Генерацію завершено", desc: "Пакет із 6 банерів готовий до завантаження", time: "2 хв" },
        { title: "Додано новий шаблон", desc: "Betting · «Експрес дня»", time: "1 год" },
        { title: "Акаунт активний", desc: "Поточний план: Безкоштовний", time: "вчора" },
      ],
    },
    help: {
      trigger: "Допомога",
      kb: "База знань і FAQ",
      contact: "Написати в підтримку",
    },
    projects: {
      trigger: "Мої проєкти",
      all: "Уся історія",
      updated: "Змінено {date}",
    },
    profile: {
      trigger: "Профіль",
      account: "Акаунт",
      history: "Історія",
      help: "Допомога і підтримка",
      admin: "Адмін-панель",
      signOut: "Вийти",
    },
    guest: {
      login: "Увійти",
      register: "Реєстрація",
    },
    language: {
      aria: "Мова інтерфейсу",
      title: "Мова інтерфейсу",
      hint: "Змінює мову інтерфейсу продукту.",
    },
    sections: {
      switch: "Перемкнути розділ",
      all: "Розділи",
      coach:
        "Тут можна перемикатися між Банер-генератором, Лендинг-генератором та іншими інструментами.",
      coachOk: "Зрозуміло",
    },
    project: {
      untitled: "Проєкт без назви",
      rename: "Перейменувати проєкт",
    },
    progress: {
      error: "Помилка",
      master: "Майстер",
      done: "Готово",
      open: "Відкрити сторінку генерації",
      abort: "Перервати",
      hide: "Сховати",
      abortAll: "Перервати завдання, що залишились",
      hideIndicator: "Сховати індикатор",
    },
    unsaved: "Є незбережені зміни. Продовжити?",
    unsavedModal: {
      title: "Незбережені зміни",
      body: "У вас є незбережені зміни. Якщо ви продовжите, їх буде втрачено.",
      stay: "Залишитися",
      leave: "Продовжити без збереження",
    },
  },
  workspace: {
    switch: "Мій Workspace",
    all: "Мої простори",
    manage: "Керування просторами",
  },
};

export const MESSAGES: Record<Locale, Messages> = { ru, en, uk };
