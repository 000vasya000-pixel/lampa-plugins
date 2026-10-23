(function () {
    'use strict';

    // 1. Функция парсинга публичных ссылок Яндекс.Диска в прямые медиа-потоки
    function getDirectYandexLink(publicUrl, callback, errorCallback) {
        var network = new Lampa.Reguest();
        var apiUrl = 'https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=' + encodeURIComponent(publicUrl);
        network.timeout(20000);

        network[window.god_enabled ? 'native' : 'silent'](apiUrl, function (res) {
            if (res && typeof res.href === 'string' && res.href) {
                callback(res.href); // Передаем прямую ссылку на .mkv/.mp4 файл
            } else {
                errorCallback('Не удалось извлечь прямую ссылку из Яндекс.Диска');
            }
        }, function (error) {
            var status = error && error.status ? ' (HTTP ' + error.status + ')' : '';
            errorCallback('Ошибка сети при обращении к API Яндекс.Диска' + status);
        });
    }

    // 2. GUI Компонент экрана контента "3D Кинотеатр"
    function Boosty3DComponent(object) {
        var component = new Lampa.InteractionCategory(object);
        var network = new Lampa.Reguest();
        var cursors = {'1': ''};
        var token = Lampa.Storage.get('boosty_auth_token', '');
        var headers = {};

        if (token) {
            headers.Authorization = /^Bearer\s/i.test(token.trim()) ? token.trim() : 'Bearer ' + token.trim();
        }

        function requestPage(params, resolve, reject) {
            var page = params.page || 1;
            var offset = cursors[page];
            if (typeof offset === 'undefined') {
                reject(new Error('Missing Boosty pagination cursor for page ' + page));
                return;
            }

            var pageUrl = 'https://api.boosty.to/v1/blog/hugheyvr/post/?limit=20&comments_limit=0&reply_limit=0&is_only_allowed=true';
            if (offset) pageUrl += '&offset=' + encodeURIComponent(offset);
            var requestUrl = pageUrl;
            if (!window.god_enabled && Lampa.Utils && typeof Lampa.Utils.proxyUrl === 'function') {
                requestUrl = Lampa.Utils.proxyUrl(pageUrl) || pageUrl;
            }

            network.timeout(20000);
            network[window.god_enabled ? 'native' : 'silent'](requestUrl, function (response) {
                if (!response || !Array.isArray(response.data)) {
                    reject(new Error('Invalid response from Boosty'));
                    return;
                }

                var nextOffset = response.extra && response.extra.offset;
                var isLast = response.data.length === 0 || (response.extra && response.extra.isLast);

                if (!isLast && (!nextOffset || nextOffset === offset || Object.keys(cursors).some(function (cursorPage) {
                    return cursors[cursorPage] === nextOffset;
                }))) {
                    reject(new Error('Boosty returned an invalid pagination cursor'));
                    return;
                }

                if (!isLast) cursors[page + 1] = nextOffset;

                var results = response.data.map(function (post) {
                    var poster = '';
                    if (post.teaser && post.teaser.length) {
                        var image = post.teaser.find(function (block) {
                            return block.type === 'image';
                        });
                        if (image) poster = image.url;
                    }

                    post.name = post.title;
                    post.poster = poster;
                    post.img = poster;
                    post.background_image = poster;
                    post.release_date = '3D Фильм';
                    return post;
                });

                resolve({
                    results: results,
                    collection: true,
                    total_pages: isLast ? page : page + 1,
                });
            }, reject, false, {
                headers: headers,
            });
        }

        component.create = function () {
            var self = this;
            this.activity.loader(true);
            requestPage(object, function (data) {
                self.build(data);
            }, this.empty.bind(this));
            return this.render();
        };

        component.nextPageReuest = function (params, resolve, reject) {
            requestPage(params, resolve.bind(this), reject.bind(this));
        };

        component.cardRender = function (params, post, card) {
            function handleAction(actionType) {
                var linkBlock = post.data && post.data.find(function (block) {
                    return block.type === 'link' && block.url && (block.url.indexOf('disk.yandex') !== -1 || block.url.indexOf('yadi.sk') !== -1);
                });

                if (!linkBlock) {
                    Lampa.Noty.show(post.hasAccess === false ? 'Для доступа к этому посту требуется подписка Boosty.' : 'Ссылка на видео в посте не найдена.');
                    return;
                }

                Lampa.Noty.show(actionType === 'download' ? 'Подготовка файла к скачиванию...' : 'Парсинг ссылки Яндекс.Диска...');
                getDirectYandexLink(linkBlock.url, function (directStreamUrl) {
                    if (actionType === 'download') {
                        if (Lampa.Platform && Lampa.Platform.is && Lampa.Platform.is('android')) {
                            Lampa.Android.openInConnect(directStreamUrl);
                        } else {
                            window.open(directStreamUrl + '&attachments=1', '_blank');
                        }
                        Lampa.Noty.show('Ссылка отправлена в менеджер загрузок');
                    } else {
                        Lampa.Player.play({url: directStreamUrl, title: post.title});
                    }
                }, function (errorMessage) {
                    Lampa.Noty.show(errorMessage);
                });
            }

            card.onEnter = function () {
                handleAction('play');
            };
            card.onMenu = function () {
                Lampa.Select.show({
                    title: post.title,
                    items: [
                        {title: 'Смотреть онлайн', action: 'play'},
                        {title: 'Скачать видеофайл', action: 'download'},
                        {title: 'Открыть пост на сайте Boosty', action: 'open_boosty'},
                        {title: 'Отмена', action: 'close'},
                    ],
                    onSelect: function (item) {
                        if (item.action === 'play' || item.action === 'download') {
                            handleAction(item.action);
                        } else if (item.action === 'open_boosty') {
                            var blogUrl = post.user && post.user.blogUrl ? post.user.blogUrl : 'hugheyvr';
                            window.open('https://boosty.to/' + blogUrl + '/posts/' + encodeURIComponent(post.id), '_blank');
                        }
                    },
                });
            };
        };

        component.destroy = function () {
            network.clear();
        };

        return component;
    }

    var pluginStarted = false;

    // 3. Функция безопасного внедрения настроек и кнопки меню
    function startPlugin() {
        if (pluginStarted) return;
        pluginStarted = true;

        // Добавление инпута для токена в Настройки -> Плагины
        if (Lampa.SettingsApi && typeof Lampa.SettingsApi.addParam === 'function') {
            Lampa.SettingsApi.addParam({
                component: 'plugins',
                param: {name: 'boosty_auth_token', type: 'input', default: ''},
                field: {
                    name: 'Boosty Авторизация (Bearer токен)',
                    description: 'Вставьте ваш токен "Bearer eyJhbGci..." для доступа к платным 3D фильмам'
                }
            });
        }

        // Регистрируем наш кастомный класс экрана в системе под уникальным именем
        Lampa.Component.add('boosty_3d', Boosty3DComponent);

        var menuData = {
            id: 'boosty_3d_menu',
            title: '3D Кинотеатр',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg>',
            component: 'boosty_3d',
            page: true
        };

        // Как в kulik.js: добавляем пункт меню в реальный список Lampa.
        var injectTimer = setInterval(function () {
            var menuList = $('.menu .menu__list').eq(0);
            if (menuList.length) {
                if ($('#boosty_3d_menu').length) {
                    clearInterval(injectTimer);
                    return;
                }

                var button = $('<li class="menu__item selector" id="boosty_3d_menu"></li>');
                button.append($('<div class="menu__ico"></div>').append(menuData.icon));
                button.append($('<div class="menu__text"></div>').text(menuData.title));
                button.on('hover:enter', function () {
                    Lampa.Activity.push({
                        url: '',
                        title: menuData.title,
                        component: 'boosty_3d',
                        page: 1
                    });
                });
                menuList.append(button);
                clearInterval(injectTimer);
            }
        }, 500);
    }

// 4. Логика контроля таймингов загрузки скрипта (bootstrap)
    function bootstrap() {
        if (typeof Lampa === 'undefined') {
            return setTimeout(bootstrap, 200); // Базовые скрипты Lampa еще не в памяти, ждем
        }
        if (window.appready) {
            startPlugin(); // Приложение полностью прогружено
        } else if (Lampa.Listener && typeof Lampa.Listener.follow === 'function') {
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') startPlugin();
            });
// Резервный таймер на случай, если событие ready проскочило до подписки на Listener
            setTimeout(function () {
                if (window.appready) startPlugin();
            }, 1500);
        } else {
            setTimeout(startPlugin, 2000); // Запуск по таймауту вслепую
        }
    }

    bootstrap();
})();
