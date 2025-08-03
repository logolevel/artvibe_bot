require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');

// --- Переменные окружения ---
const {
    BOT_TOKEN,
    PORT,
    WEBHOOK_URL,
    INVITE_LINK,
    EXPRESS_PDF_FILE_ID,
    AUTHOR_PDF_FILE_ID,
    ADMIN_ID_RADMILA,
    ADMIN_ID_DANYLO,
    ADMIN_ID_ANASTASIA,
    ADMIN_NAME_RADMILA,
    ADMIN_NAME_DANYLO,
    ADMIN_NAME_ANASTASIA,
    CARD_NUMBER_RUB,
    IBAN_EUR,
    CARD_NUMBER_UAH,
} = process.env;

if (!BOT_TOKEN || !PORT || !WEBHOOK_URL) {
    throw new Error("Необходимо задать переменные окружения: BOT_TOKEN, PORT и WEBHOOK_URL");
}

// --- Тексты на кнопках ---
const COPY_BUTTON_RUB = "Скопировать номер 👇";
const COPY_BUTTON_EUR = "Скопировать IBAN 👇";
const COPY_BUTTON_UAH = "Скопировать номер 👇";


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
✨ **Бесплатный урок уже ждет вас!**

Это отличная возможность познакомиться с нашим подходом к обучению. Нажмите на кнопку ниже, чтобы получить мгновенный доступ.
    `;
    ctx.replyWithMarkdown(message, freeLessonMenu);
});

bot.hears('Экспресс курс', (ctx) => {
    const message = `
🚀 **Экспресс курс**

Идеальный вариант для тех, кто хочет быстро погрузиться в тему и получить результат.
    `;
    ctx.replyWithMarkdown(message, expressCourseMenu);
});

bot.hears('Авторский курс', (ctx) => {
    const message = `
🎓 **Авторский курс**

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

    setTimeout(() => {
        if (username) {
            ctx.reply("Отправьте скриншот оплаты в этот чат, просто прикрепите фото.");
            paymentExpectations.set(userId, { adminId, course: coursePrefix });
        } else {
            ctx.reply(`Пожалуйста, отправьте нам ${adminName} скриншот оплаты в личные сообщения, и мы сразу же отправим Вам ссылку на курс.`);
        }
    }, 60 * 1000);
};

// --- Обработчики для кнопок оплаты ---
// Теперь мы формируем текст прямо здесь и передаем его в handlePayment

const createRequisitesText = (currency) => {
    switch (currency) {
        case 'rub':
            return `Оплата в рублях:\nКарта: ${CARD_NUMBER_RUB}\nБанк: Сбербанк\nПолучатель: Джульетта Ф.\n\nЦена: 7500 руб.`;
        case 'eur':
            return `Оплата в евро:\nBIC: PESOBEB1\nIBAN: ${IBAN_EUR}\nБанк: N26\nПолучатель: Danylo K.\n\nЦена: 75 EUR`;
        case 'uah':
            return `Оплата в гривнах:\nКарта: ${CARD_NUMBER_UAH}\nБанк: ПриватБанк\nПолучатель: Завірюха А.\n\nЦена: 3500 UAH`;
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
        adminId = ADMIN_ID_DANYLO;
        adminName = ADMIN_NAME_DANYLO;
        copyButtonText = COPY_BUTTON_EUR;
    } else { // uah
        adminId = ADMIN_ID_ANASTASIA;
        adminName = ADMIN_NAME_ANASTASIA;
        copyButtonText = COPY_BUTTON_UAH;
    }

    handlePayment(ctx, coursePrefix, requisitesText, copyButtonText, adminId, adminName);
});


// Обработчики для кнопок "Скопировать"
bot.action(/copy_(rub|eur|uah)/, (ctx) => {
    const currency = ctx.match[1];
    let textToCopy = '';

    // Логика стала намного проще и надежнее
    if (currency === 'rub') textToCopy = CARD_NUMBER_RUB;
    if (currency === 'eur') textToCopy = IBAN_EUR;
    if (currency === 'uah') textToCopy = CARD_NUMBER_UAH;

    if (textToCopy) {
        ctx.reply(`<code>${textToCopy}</code>`, { parse_mode: 'HTML' });
        ctx.answerCbQuery('Номер скопирован!');
    } else {
        ctx.answerCbQuery('Не удалось извлечь номер для копирования.');
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
