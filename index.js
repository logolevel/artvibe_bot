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
const EXPRESS_PDF_FILE_ID = 'BQACAgIAAyEFAASeM37lAAMcaI-KJR1G5DSJE8fCPFTiGo9ev-cAAj6dAALP-XlIKMKUBLtieyc2BA';
const AUTHOR_PDF_FILE_ID = 'BQACAgIAAyEFAASeM37lAAMfaI-KVWrt44QLGDDMk86TBSHyGmQAAkCdAALP-XlIOh7V9__OvCk2BA';

// --- Тексты на кнопках ---
const COPY_BUTTON_RUB = "Показать номер карты";
const COPY_BUTTON_EUR = "Показать IBAN";
const COPY_BUTTON_UAH = "Показать номер карты";


// --- Инициализация бота и Express ---
const bot = new Telegraf(BOT_TOKEN);
const app = express();

// --- Временное хранилище ---
const paymentExpectations = new Map();
const userPaymentMessages = new Map(); 

// --- Клавиатуры ---
const mainMenu = Markup.keyboard([
    ['Бесплатный урок', 'Запись на workshop'],
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
    [Markup.button.callback('Приобрести: Standard', 'author_standard_buy')],
    [Markup.button.callback('Приобрести: Premium', 'author_premium_buy')],
]);

const paymentMenu = (coursePrefix) => Markup.inlineKeyboard([
    [Markup.button.callback('Оплата в рублях', `${coursePrefix}_pay_rub`)],
    [Markup.button.callback('Оплата в евро', `${coursePrefix}_pay_eur`)],
    [Markup.button.callback('Оплата в гривнах', `${coursePrefix}_pay_uah`)],
]);

const workshopApplicationText = "Здравствуйте! Хочу записаться на воркшоп по арт-терапии в Аликанте. Есть ли свободные места на ближайшую субботу?";
const adminUsername = ADMIN_NAME_RADMILA.replace('@', '');
const workshopUrl = `https://t.me/${adminUsername}?text=${encodeURIComponent(workshopApplicationText)}`;

const workshopMenu = Markup.inlineKeyboard([
    Markup.button.url('Оставить заявку', workshopUrl),
]);


// --- Вспомогательные функции для очистки сообщений ---
async function cleanupAllPaymentMessages(ctx) {
    const userId = ctx.from.id;
    const messageState = userPaymentMessages.get(userId);

    if (messageState) {
        const allMessageIds = [messageState.mainMenuId, ...messageState.subMenuIds].filter(id => id);
        if (allMessageIds.length > 0) {
            await Promise.all(
                allMessageIds.map(msgId => ctx.deleteMessage(msgId).catch(() => {}))
            );
        }
    }
    userPaymentMessages.delete(userId);
}

async function cleanupSubMessages(ctx) {
    const userId = ctx.from.id;
    const messageState = userPaymentMessages.get(userId);

    if (messageState && messageState.subMenuIds.length > 0) {
        await Promise.all(
            messageState.subMenuIds.map(msgId => ctx.deleteMessage(msgId).catch(() => {}))
        );
        messageState.subMenuIds = [];
        userPaymentMessages.set(userId, messageState);
    }
}

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

bot.hears('Запись на workshop', (ctx) => {
    const message = `
Если вы хотите записаться на workshop, который проходит в Аликанте в 17:00. 
Оставьте, пожалуйста, заявку, написав администратору в телеграм ${ADMIN_NAME_RADMILA}
    `;
    ctx.reply(message, workshopMenu);
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

bot.action('express_buy', async (ctx) => {
    await cleanupAllPaymentMessages(ctx);
    const coursePrefix = 'express';
    const sentMessage = await ctx.reply('Выберите валюту для оплаты:', paymentMenu(coursePrefix));
    userPaymentMessages.set(ctx.from.id, { mainMenuId: sentMessage.message_id, subMenuIds: [] });
    ctx.answerCbQuery();
});

bot.action(/^(author_standard|author_premium)_buy$/, async (ctx) => {
    await cleanupAllPaymentMessages(ctx);
    const coursePrefix = ctx.match[1];
    const sentMessage = await ctx.reply('Выберите валюту для оплаты:', paymentMenu(coursePrefix));
    userPaymentMessages.set(ctx.from.id, { mainMenuId: sentMessage.message_id, subMenuIds: [] });
    ctx.answerCbQuery();
});


// --- Обработчики для кнопок оплаты ---

const formatForDisplay = (numberString) => {
    if (!numberString) return '';
    return numberString.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
};


const createRequisitesText = (currency, coursePrefix) => {
    let priceRub, priceEur, priceUah;

    if (coursePrefix === 'express') {
        priceRub = '7500 руб.';
        priceEur = '75 EUR';
        priceUah = '3500 UAH';
    } else if (coursePrefix === 'author_standard') {
        priceRub = '86000 руб.';
        priceEur = '550 EUR';
        priceUah = '26000 UAH';
    } else { // author_premium
        priceRub = '86000 руб.';
        priceEur = '940 EUR';
        priceUah = '45000 UAH';
    }

    const formattedCardRub = formatForDisplay(CARD_NUMBER_RUB);
    const formattedIbanEur = formatForDisplay(IBAN_EUR);
    const formattedCardUah = formatForDisplay(CARD_NUMBER_UAH);

    switch (currency) {
        case 'rub':
            return `Оплата в рублях:\n\nКарта: ${formattedCardRub}\nБанк: Сбербанк\nПолучатель: Джульетта Ф.\n\nЦена: ${priceRub}`;
        case 'eur':
            return `Оплата в евро:\n\nBIC: PESOBEB1\nIBAN: ${formattedIbanEur}\nПолучатель: Radmila Merkulova\n\nЦена: ${priceEur}`;
        case 'uah':
            return `Оплата в гривнях:\n\nКартка: ${formattedCardUah}\nБанк: ПриватБанк\nОтримувач: Завірюха А.\n\nЦіна: ${priceUah}`;
        default:
            return 'Реквизиты не найдены.';
    }
};

bot.action(/^(express|author_standard|author_premium)_pay_(rub|eur|uah)$/, async (ctx) => {
    await cleanupSubMessages(ctx); 
    
    const userId = ctx.from.id;
    const messageState = userPaymentMessages.get(userId) || { mainMenuId: null, subMenuIds: [] };
    const [_, coursePrefix, currency] = ctx.match;
    const requisitesText = createRequisitesText(currency, coursePrefix);
    
    let adminId, adminName, copyButtonText;

    if (currency === 'rub') {
        adminId = ADMIN_ID_RADMILA;
        adminName = ADMIN_NAME_RADMILA;
        copyButtonText = COPY_BUTTON_RUB;
    } else if (currency === 'eur') {
        adminId = ADMIN_ID_RADMILA;
        adminName = ADMIN_NAME_RADMILA;
        copyButtonText = COPY_BUTTON_EUR;
    } else {
        adminId = ADMIN_ID_ANASTASIA;
        adminName = ADMIN_NAME_ANASTASIA;
        copyButtonText = COPY_BUTTON_UAH;
    }

    ctx.answerCbQuery();

    const requisitesMsg = await ctx.reply(
        requisitesText,
        Markup.inlineKeyboard([Markup.button.callback(copyButtonText, `copy_${currency}`)])
    );
    messageState.subMenuIds.push(requisitesMsg.message_id);

    let followUpMsg;
    if (ctx.from.username) {
        followUpMsg = await ctx.reply("После оплаты, пожалуйста, отправьте скриншот об оплате в этот чат, просто прикрепите его как фото.");
        paymentExpectations.set(userId, { adminId, course: coursePrefix });
    } else {
        followUpMsg = await ctx.reply(`После оплаты, пожалуйста, отправьте нам скриншот об оплате в личные сообщения: ${adminName} и мы сразу же отправим Вам ссылку на курс.`);
    }
    messageState.subMenuIds.push(followUpMsg.message_id);
    
    userPaymentMessages.set(userId, messageState);
});


bot.action(/copy_(rub|eur|uah)/, async (ctx) => {
    const userId = ctx.from.id;
    const messageState = userPaymentMessages.get(userId) || { mainMenuId: null, subMenuIds: [] };
    const currency = ctx.match[1];
    let textToCopy = '';
    let entityType = 'номер карты';

    if (currency === 'rub') {
        textToCopy = CARD_NUMBER_RUB;
        entityType = 'номер карты';
    } else if (currency === 'eur') {
        textToCopy = IBAN_EUR;
        entityType = 'IBAN';
    } else {
        textToCopy = CARD_NUMBER_UAH;
        entityType = 'номер карты';
    }

    ctx.answerCbQuery();

    if (textToCopy) {
        const instructionMsg = await ctx.reply(`Нажмите на ${entityType} ниже, чтобы скопировать 👇`);
        const numberMsg = await ctx.reply(`<code>${textToCopy.replace(/\s/g, '')}</code>`, { parse_mode: 'HTML' });
        
        messageState.subMenuIds.push(instructionMsg.message_id, numberMsg.message_id);
        userPaymentMessages.set(userId, messageState);
    } else {
        const errorMsg = await ctx.reply('Не удалось найти номер для копирования. Пожалуйста, свяжитесь с поддержкой.');
        messageState.subMenuIds.push(errorMsg.message_id);
        userPaymentMessages.set(userId, messageState);
    }
});

// Обработка получения фото (скриншота оплаты)
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    await cleanupAllPaymentMessages(ctx);
    const expectation = paymentExpectations.get(userId);

    if (expectation) {
        const { adminId, course } = expectation;

        let courseName = 'Неизвестный курс';
        if (course === 'express') {
            courseName = 'Экспресс курс';
        } else if (course === 'author_standard') {
            courseName = 'Авторский курс (Standard)';
        } else if (course === 'author_premium') {
            courseName = 'Авторский курс (Premium)';
        }

        const user = ctx.from;
        const caption = `
Новый скриншот оплаты!

Курс: **${courseName}**
Пользователь: ${user.first_name} ${user.last_name || ''}
Username: @${user.username || 'не указан'}
User ID: ${user.id}
        `;
        
        try {
            await bot.telegram.sendPhoto(adminId, ctx.message.photo[ctx.message.photo.length - 1].file_id, { 
                caption: caption,
                parse_mode: 'Markdown' 
            });

            await ctx.reply("Мы получили фото, проверим его и сразу же отправим Вам ссылку на курс.");
        } catch (error) {
            console.error(`Не удалось отправить фото админу ${adminId}:`, error);
            if (error.description && error.description.includes('chat not found')) {
                await ctx.reply(`Неудачная отправка фото. Отправь, пожалуйста, фото в личные сообщение нашему главному администратору: ${ADMIN_NAME_RADMILA}`);
            } else {
                await ctx.reply(`Произошла ошибка при отправке вашего фото. Пожалуйста, свяжитесь с поддержкой: ${ADMIN_NAME_RADMILA}`);
            }
        } finally {
            paymentExpectations.delete(userId);
        }
    }
});

// --- Настройка Webhook и запуск сервера ---
app.use(express.json());

bot.telegram.setWebhook(`${WEBHOOK_URL}/bot${BOT_TOKEN}`)
    .then(() => console.log('Webhook успешно установлен!'))
    .catch(console.error);

app.post(`/bot${BOT_TOKEN}`, (req, res) => {
    bot.handleUpdate(req.body);
    res.sendStatus(200);
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
