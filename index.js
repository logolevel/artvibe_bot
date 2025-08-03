require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');

// --- Переменные окружения ---
const {
    BOT_TOKEN,
    PORT,
    WEBHOOK_URL,
    INVITE_LINK,
    ADMIN_ID_RADMILA,
    ADMIN_ID_ANASTASIA,
    CARD_NUMBER_RUB,
    IBAN_EUR,
    CARD_NUMBER_UAH,
} = process.env;

if (!BOT_TOKEN || !PORT || !WEBHOOK_URL) {
    throw new Error("Необходимо задать переменные окружения: BOT_TOKEN, PORT и WEBHOOK_URL");
}

// --- Конфигурация в коде ---
const ADMIN_NAME_RADMILA = '@radaeuro';
const ADMIN_NAME_ANASTASIA = '@ArtBenidorm';
const EXPRESS_PDF_FILE_ID = 'BQACAgIAAyEFAASeM37lAAMWaI439QWdHkmsu3nuabqRF-mAHbAAAk2_AALP-XFI8WJ1uHvIdlI2BA';
const AUTHOR_PDF_FILE_ID = 'BQACAgIAAyEFAASeM37lAAMZaI44n8FffX7177dWCgqwPMX_iZkAAlG_AALP-XFIg8RqNhvVhgc2BA';

// --- Тексты на кнопках ---
const COPY_BUTTON_RUB = "Скопировать номер";
const COPY_BUTTON_EUR = "Скопировать IBAN";
const COPY_BUTTON_UAH = "Скопировать номер";


// --- Инициализация бота и Express ---
const bot = new Telegraf(BOT_TOKEN);
const app = express();

// --- Временное хранилище ---
const paymentExpectations = new Map();

// --- Клавиатуры ---
const mainMenu = Markup.keyboard([
    ['Бесплатный урок'],
    ['Экспресс курс', 'Авторский курс'],
]).resize();

const freeLessonMenu = Markup.inlineKeyboard([
    Markup.button.url('Получить урок', INVITE_LINK || 'https://t.me/'),
]);

const expressCourseMenu = Markup.inlineKeyboard([
    [Markup.button.callback('Узнать больше', 'express_learn_more')],
    [Markup.button.callback('Приобрести экспресс курс', 'express_buy')],
]);

const authorCourseMenu = Markup.inlineKeyboard([
    [Markup.button.callback('Узнать больше', 'author_learn_more')],
    [Markup.button.callback('Приобрести авторский курс', 'author_buy')],
]);

const paymentMenu = (coursePrefix) => Markup.inlineKeyboard([
    [Markup.button.callback('Оплата в рублях', `${coursePrefix}_pay_rub`)],
    [Markup.button.callback('Оплата в евро', `${coursePrefix}_pay_eur`)],
    [Markup.button.callback('Оплата в гривнах', `${coursePrefix}_pay_uah`)],
]);

// --- Логика бота ---

bot.start(async (ctx) => {
    const welcomeMessage = `
👋 **Добро пожаловать!**

Выберите интересующий вас раздел в меню ниже. 👇
    `;
    await ctx.replyWithMarkdown(welcomeMessage, mainMenu);
});

bot.on('channel_post', async (ctx) => {
    if (ctx.channelPost && ctx.channelPost.document && ctx.channelPost.document.mime_type === 'application/pdf') {
        const fileId = ctx.channelPost.document.file_id;
        const chatId = ctx.channelPost.chat.id;
        await bot.telegram.sendMessage(chatId, `PDF получен (из канала). Вот его file_id:`);
        await bot.telegram.sendMessage(chatId, `<code>${fileId}</code>`, { parse_mode: 'HTML' });
    }
});

bot.hears('Бесплатный урок', (ctx) => {
    const message = `
✨ **Бесплатный урок из платной программы уже ждет вас!**

Это отличная возможность познакомиться с нашим подходом к обучению. Нажмите на кнопку ниже, чтобы получить мгновенный доступ.
    `;
    ctx.replyWithMarkdown(message, freeLessonMenu);
});

bot.hears('Экспресс курс', (ctx) => {
    const message = `
🚀 **Экспресс курс**

"Творческий антистресс: три простых шага к твоему спокойствию"

Идеальный вариант для тех, кто хочет быстро погрузиться в тему и получить результат.
    `;
    ctx.replyWithMarkdown(message, expressCourseMenu);
});

bot.hears('Авторский курс', (ctx) => {
    const message = `
🎓 **Авторский терапевтический курс**

"Исследуй себя через творчество"

Полное и глубокое погружение в предмет с личной поддержкой автора. Максимум практики и знаний.
    `;
    ctx.replyWithMarkdown(message, authorCourseMenu);
});

bot.action('express_learn_more', (ctx) => {
    if (!EXPRESS_PDF_FILE_ID) return ctx.reply('Файл с информацией о курсе временно недоступен.');
    ctx.replyWithDocument(EXPRESS_PDF_FILE_ID, { caption: 'Подробная программа экспресс курса.' });
    ctx.answerCbQuery();
});

bot.action('author_learn_more', (ctx) => {
    if (!AUTHOR_PDF_FILE_ID) return ctx.reply('Файл с информацией о курсе временно недоступен.');
    ctx.replyWithDocument(AUTHOR_PDF_FILE_ID, { caption: 'Подробная программа авторского курса.' });
    ctx.answerCbQuery();
});

bot.action(['express_buy', 'author_buy'], (ctx) => {
    const coursePrefix = ctx.match[0].split('_')[0];
    ctx.reply('Выберите валюту для оплаты:', paymentMenu(coursePrefix));
    ctx.answerCbQuery();
});

// --- Логика оплаты ---

const handlePayment = async (ctx, coursePrefix, requisites, copyText, adminId, adminName) => {
    const userId = ctx.from.id;
    const username = ctx.from.username;
    const currency = copyText === COPY_BUTTON_RUB ? 'rub' : (copyText === COPY_BUTTON_EUR ? 'eur' : 'uah');

    // Сразу отвечаем на колбэк, чтобы убрать часики на кнопке
    ctx.answerCbQuery();

    // Отправляем НОВОЕ сообщение с реквизитами, вместо редактирования старого
    await ctx.reply(
        requisites,
        Markup.inlineKeyboard([Markup.button.callback(copyText, `copy_${currency}`)])
    );

    if (username) {
        ctx.reply("После оплаты, пожалуйста, отправьте скриншот об оплате в этот чат, просто прикрепите его как фото.");
        paymentExpectations.set(userId, { adminId, course: coursePrefix });
    } else {
        ctx.reply(`После оплаты, пожалуйста, отправьте нам скриншот об оплате в личные сообщения: ${adminName} и мы сразу же отправим Вам ссылку на курс.`);
    }
};

// --- Обработчики для кнопок оплаты ---
// Теперь мы формируем текст прямо здесь и передаем его в handlePayment

const createRequisitesText = (currency) => {
    switch (currency) {
        case 'rub':
            return `Оплата в рублях:\n\nКарта: ${CARD_NUMBER_RUB}\nБанк: Сбербанк\nПолучатель: Джульетта Ф.\n\nЦена: 7500 руб.`;
        case 'eur':
            return `Оплата в евро:\n\nBIC: PESOBEB1\nIBAN: ${IBAN_EUR}\nПолучатель: Radmila Merkulova\n\nЦена: 75 EUR`;
        case 'uah':
            return `Оплата в гривнах:\n\nКарта: ${CARD_NUMBER_UAH}\nБанк: ПриватБанк\nПолучатель: Завірюха А.\n\nЦена: 3500 UAH`;
        default:
            return 'Реквизиты не найдены.';
    }
};

bot.action(/^(express|author)_pay_(rub|eur|uah)$/, (ctx) => {
    const [_, coursePrefix, currency] = ctx.match;
    const requisitesText = createRequisitesText(currency);
    
    let adminId, adminName, copyButtonText;

    if (currency === 'rub') {
        adminId = ADMIN_ID_RADMILA;
        adminName = ADMIN_NAME_RADMILA;
        copyButtonText = COPY_BUTTON_RUB;
    } else if (currency === 'eur') {
        adminId = ADMIN_ID_RADMILA;
        adminName = ADMIN_NAME_RADMILA;
        copyButtonText = COPY_BUTTON_EUR;
    } else { // uah
        adminId = ADMIN_ID_ANASTASIA;
        adminName = ADMIN_NAME_ANASTASIA;
        copyButtonText = COPY_BUTTON_UAH;
    }

    handlePayment(ctx, coursePrefix, requisitesText, copyButtonText, adminId, adminName);
});


// Обработчики для кнопок "Скопировать"
bot.action(/copy_(rub|eur|uah)/, async (ctx) => {
    const currency = ctx.match[1];
    let textToCopy = '';
    let entityType = 'номер карты';

    if (currency === 'rub') {
        textToCopy = CARD_NUMBER_RUB;
        entityType = 'номер карты';
    } else if (currency === 'eur') {
        textToCopy = IBAN_EUR;
        entityType = 'IBAN';
    } else if (currency === 'uah') {
        textToCopy = CARD_NUMBER_UAH;
        entityType = 'номер карты';
    }

    // Сразу убираем часики с кнопки
    ctx.answerCbQuery();

    if (textToCopy) {
        // Отправляем инструкцию
        await ctx.reply(`Нажмите на ${entityType} ниже, чтобы скопировать 👇`);
        // Отправляем номер для копирования
        await ctx.reply(`<code>${textToCopy}</code>`, { parse_mode: 'HTML' });
    } else {
        await ctx.reply('Не удалось найти номер для копирования. Пожалуйста, свяжитесь с поддержкой.');
    }
});

// Обработка получения фото (скриншота оплаты)
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    const expectation = paymentExpectations.get(userId);

    if (expectation) {
        const { adminId, course } = expectation;
        const courseName = course === 'express' ? 'Экспресс курс' : 'Авторский курс';
        const user = ctx.from;
        const caption = `
Новый скриншот оплаты!

Курс: **${courseName}**
Пользователь: ${user.first_name} ${user.last_name || ''}
Username: @${user.username || 'не указан'}
User ID: ${user.id}
        `;

        await bot.telegram.sendPhoto(adminId, ctx.message.photo[ctx.message.photo.length - 1].file_id, { 
            caption: caption,
            parse_mode: 'Markdown' 
        });

        await ctx.reply("Мы получили фото, проверим его и сразу же отправим Вам ссылку на курс.");
        paymentExpectations.delete(userId);
    }
});

// --- Настройка Webhook и запуск сервера ---
app.use(express.json());

bot.telegram.setWebhook(`${WEBHOOK_URL}/bot${BOT_TOKEN}`)
    .then(() => console.log('Webhook успешно установлен!'))
    .catch(console.error);

app.post(`/bot${BOT_TOKEN}`, (req, res) => {
    bot.handleUpdate(req.body, res);
});

app.get('/', (req, res) => {
    res.send('Привет! Бот работает.');
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});

bot.catch((err, ctx) => {
    console.error(`Ошибка для ${ctx.updateType}`, err);
});
