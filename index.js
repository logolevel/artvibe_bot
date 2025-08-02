require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');

// --- Переменные окружения ---
// Обязательно создайте файл .env и заполните его по примеру .env.example
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
    REQUISITES_RUB,
    REQUISITES_EUR,
    REQUISITES_UAH,
    COPY_BUTTON_RUB,
    COPY_BUTTON_EUR,
    COPY_BUTTON_UAH,
} = process.env;

if (!BOT_TOKEN || !PORT || !WEBHOOK_URL) {
    throw new Error("Необходимо задать переменные окружения: BOT_TOKEN, PORT и WEBHOOK_URL");
}

// --- Инициализация бота и Express ---
const bot = new Telegraf(BOT_TOKEN);
const app = express();

// --- Временное хранилище для отслеживания ожиданий оплаты ---
// В будущем это будет заменено на базу данных
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
    [Markup.button.callback('Оплата в гривнях', `${coursePrefix}_pay_uah`)],
]);


// --- Логика бота ---

// [START] - Приветствие и главное меню
bot.start(async (ctx) => {
    const welcomeMessage = `
👋 **Добро пожаловать!**

Я ваш помощник в мире новых знаний. Здесь вы можете получить доступ к эксклюзивным курсам.

Выберите интересующий вас раздел в меню ниже. 👇
    `;
    await ctx.replyWithMarkdown(welcomeMessage, mainMenu);
});

// [Служебная команда] - Получение file_id для PDF
bot.on('document', async (ctx) => {
    if (ctx.message.document.mime_type === 'application/pdf') {
        await ctx.reply('PDF получен. Вот его file_id:');
        await ctx.reply(ctx.message.document.file_id);
    }
});

// --- Обработка кнопок главного меню ---

// [Меню] -> "Бесплатный урок"
bot.hears('Бесплатный урок', (ctx) => {
    const message = `
✨ **Бесплатный урок уже ждет вас!**

Это отличная возможность познакомиться с нашим подходом к обучению. Нажмите на кнопку ниже, чтобы получить мгновенный доступ.
    `;
    ctx.replyWithMarkdown(message, freeLessonMenu);
});

// [Меню] -> "Экспресс курс"
bot.hears('Экспресс курс', (ctx) => {
    const message = `
🚀 **Экспресс курс**

Идеальный вариант для тех, кто хочет быстро погрузиться в тему и получить результат.
    `;
    ctx.replyWithMarkdown(message, expressCourseMenu);
});

// [Меню] -> "Авторский курс"
bot.hears('Авторский курс', (ctx) => {
    const message = `
🎓 **Авторский курс**

Полное и глубокое погружение в предмет с личной поддержкой автора. Максимум практики и знаний.
    `;
    ctx.replyWithMarkdown(message, authorCourseMenu);
});

// --- Обработка колбэков (нажатий на инлайн-кнопки) ---

// "Узнать больше" для Экспресс курса
bot.action('express_learn_more', (ctx) => {
    if (!EXPRESS_PDF_FILE_ID) {
        return ctx.reply('Файл с информацией о курсе временно недоступен.');
    }
    ctx.replyWithDocument(EXPRESS_PDF_FILE_ID, { caption: 'Подробная программа экспресс курса.' });
    ctx.answerCbQuery();
});

// "Узнать больше" для Авторского курса
bot.action('author_learn_more', (ctx) => {
    if (!AUTHOR_PDF_FILE_ID) {
        return ctx.reply('Файл с информацией о курсе временно недоступен.');
    }
    ctx.replyWithDocument(AUTHOR_PDF_FILE_ID, { caption: 'Подробная программа авторского курса.' });
    ctx.answerCbQuery();
});

// "Приобрести" для обоих курсов
bot.action(['express_buy', 'author_buy'], (ctx) => {
    const coursePrefix = ctx.match[0].split('_')[0];
    ctx.reply('Выберите валюту для оплаты:', paymentMenu(coursePrefix));
    ctx.answerCbQuery();
});

// --- Логика оплаты ---

const handlePayment = async (ctx, coursePrefix, currency, requisites, copyText, adminId, adminName) => {
    const userId = ctx.from.id;
    const username = ctx.from.username;

    // Показываем реквизиты
    await ctx.editMessageText(
        requisites,
        Markup.inlineKeyboard([Markup.button.callback(copyText, `copy_${currency}`)])
    );

    // Устанавливаем таймер на 1 минуту
    setTimeout(() => {
        if (username) {
            ctx.reply("Отправьте скриншот оплаты в этот чат, просто прикрепите фото.");
            // Устанавливаем флаг ожидания фото, сохраняя информацию о курсе
            paymentExpectations.set(userId, { adminId, course: coursePrefix });
        } else {
            ctx.reply(`Пожалуйста, отправьте нам ${adminName} скриншот оплаты в личные сообщения, и мы сразу же отправим Вам ссылку на курс.`);
        }
    }, 60 * 1000); // 1 минута

    ctx.answerCbQuery();
};

// Обработчики для кнопок оплаты
bot.action('express_pay_rub', (ctx) => handlePayment(ctx, 'express', 'rub', REQUISITES_RUB, COPY_BUTTON_RUB, ADMIN_ID_RADMILA, ADMIN_NAME_RADMILA));
bot.action('express_pay_eur', (ctx) => handlePayment(ctx, 'express', 'eur', REQUISITES_EUR, COPY_BUTTON_EUR, ADMIN_ID_DANYLO, ADMIN_NAME_DANYLO));
bot.action('express_pay_uah', (ctx) => handlePayment(ctx, 'express', 'uah', REQUISITES_UAH, COPY_BUTTON_UAH, ADMIN_ID_ANASTASIA, ADMIN_NAME_ANASTASIA));

bot.action('author_pay_rub', (ctx) => handlePayment(ctx, 'author', 'rub', REQUISITES_RUB, COPY_BUTTON_RUB, ADMIN_ID_RADMILA, ADMIN_NAME_RADMILA));
bot.action('author_pay_eur', (ctx) => handlePayment(ctx, 'author', 'eur', REQUISITES_EUR, COPY_BUTTON_EUR, ADMIN_ID_DANYLO, ADMIN_NAME_DANYLO));
bot.action('author_pay_uah', (ctx) => handlePayment(ctx, 'author', 'uah', REQUISITES_UAH, COPY_BUTTON_UAH, ADMIN_ID_ANASTASIA, ADMIN_NAME_ANASTASIA));


// Обработчики для кнопок "Скопировать"
// Telegraf не может напрямую копировать в буфер обмена, поэтому просто показываем уведомление
bot.action(/copy_(rub|eur|uah)/, (ctx) => {
    const currency = ctx.match[1];
    let textToCopy = '';
    // Эта проверка нужна, чтобы извлечь только номер/IBAN из строки с реквизитами
    if (currency === 'rub') textToCopy = REQUISITES_RUB.match(/\d[\d\s]+\d/)[0];
    if (currency === 'eur') textToCopy = REQUISITES_EUR.match(/DE\d+/)[0];
    if (currency === 'uah') textToCopy = REQUISITES_UAH.match(/\d[\d\s]+\d/)[0];

    // Отправляем реквизиты отдельным сообщением, чтобы их было легко скопировать на мобильных устройствах
    ctx.reply(`<code>${textToCopy}</code>`, { parse_mode: 'HTML' });
    ctx.answerCbQuery('Номер скопирован!');
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
Username: @${user.username}
User ID: ${user.id}
        `;

        // Пересылаем фото админу
        await bot.telegram.sendPhoto(adminId, ctx.message.photo[ctx.message.photo.length - 1].file_id, { 
            caption: caption,
            parse_mode: 'Markdown' 
        });

        // Отвечаем пользователю
        await ctx.reply("Мы получили фото, проверим его и сразу же отправим Вам ссылку на курс.");

        // Удаляем флаг ожидания
        paymentExpectations.delete(userId);
    }
});


// --- Настройка Webhook ---
app.use(express.json());

// Устанавливаем вебхук при запуске
bot.telegram.setWebhook(`${WEBHOOK_URL}/bot${BOT_TOKEN}`)
    .then(() => console.log('Webhook успешно установлен!'))
    .catch(console.error);

// Обрабатываем запросы от Telegram
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
    bot.handleUpdate(req.body, res);
});

// Стартовая страница для проверки работы сервера
app.get('/', (req, res) => {
    res.send('Привет! Бот работает.');
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});

// Обработка ошибок
bot.catch((err, ctx) => {
    console.error(`Ошибка для ${ctx.updateType}`, err);
});
