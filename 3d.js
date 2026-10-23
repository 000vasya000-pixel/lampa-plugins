(function () {
    'use strict';
    
    console.log('3d loaded 11')

    // 1. Поле для ввода токена в настройках Lampa
    if (window.Lampa && Lampa.SettingsApi) {
        Lampa.SettingsApi.addParam({
            component: 'plugins',
            param: {
                name: 'boosty_auth_token',
                type: 'input',
                default: ''
            },
            field: {
                name: 'Boosty Авторизация (Bearer токен)',
                description: 'Вставьте ваш токен "Bearer eyJhbGci..." для доступа к платным 3D фильмам'
            }
        });
    }

    // Вспомогательная функция для получения прямой ссылки из Яндекс.Диска
    function getDirectYandexLink(publicUrl, callback, errorCallback) {
        var network = new Lampa.Reguest();
        var apiUrl = 'https://yandex.net' + encodeURIComponent(publicUrl);
        var targetUrl = Lampa.Utils && Lampa.Utils.proxyUrl ? Lampa.Utils.proxyUrl(apiUrl) : apiUrl;

        network.silent(targetUrl, function (res) {
            if (res && res.href) {
                callback(res.href);
            } else {
                errorCallback('Не удалось получить прямую ссылку из Я.Диска');
            }
        }, function () {
            errorCallback('Ошибка сети при запросе к API Яндекс.Диска');
        });
    }

    function Boosty3DComponent(object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({mask: true, over: true});
        var html = $('<div class="category-full"></div>');
        var items = [];

        this.create = function () {
            var self = this;
            
            var boostyUrl = 'https://boosty.to';
            var targetUrl = Lampa.Utils && Lampa.Utils.proxyUrl ? Lampa.Utils.proxyUrl(boostyUrl) : boostyUrl;
            var token = Lampa.Storage.get('boosty_auth_token', '');

            var headers = {};
            if (token) {
                headers['Authorization'] = token.trim();
            }

            network.silent(targetUrl, function (response) {
                if (response && response.data && response.data.length) {
                    self.build(response.data);
                } else {
                    html.append('<div class="empty">Не удалось загрузить фильмы с Boosty. Проверьте токен в настройках.</div>');
                }
            }, function () {
                html.append('<div class="empty">Ошибка сети при запросе к Boosty</div>');
            }, false, {
                headers: headers
            });

            return scroll.render();
        };

        this.build = function (data) {
            var container = $('<div class="category-full__body"></div>');

            data.forEach(function (post) {
                var imgUrl = '';
                if (post.teaser && post.teaser.length) {
                    var imgBlock = post.teaser.find(function(b) { return b.type === 'image'; });
                    if (imgBlock) imgUrl = imgBlock.url;
                }

                var card = Lampa.Template.get('card', {
                    title: post.title,
                    release_date: '3D Фильм'
                });

                if (imgUrl) {
                    card.find('img').attr('src', imgUrl);
                }

                // Общая функция обработки действий (Просмотр или Скачивание)
                var handleAction = function (actionType) {
                    var publicYandexUrl = '';

                    if (post.data && post.data.length) {
                        var linkBlock = post.data.find(function(b) { 
                            return b.type === 'link' && (b.url.indexOf('disk.yandex') !== -1 || b.url.indexOf('yadi.sk') !== -1); 
                        });
                        if (linkBlock) publicYandexUrl = linkBlock.url;
                    }

                    if (publicYandexUrl) {
                        Lampa.Noty.show(actionType === 'download' ? 'Подготовка файла к скачиванию...' : 'Парсинг ссылки Яндекс.Диска...');
                        
                        getDirectYandexLink(publicYandexUrl, function (directStreamUrl) {
                            if (actionType === 'download') {
                                // Попытка вызвать системное скачивание / открытие ссылки
                                if (Lampa.Platform.is('android')) {
                                    // Для Android передаем ссылку в систему
                                    Lampa.Android.openInConnect(directStreamUrl);
                                } else {
                                    // Для браузеров, Tizen и WebOS открываем в новом окне с принудительным скачиванием
                                    window.open(directStreamUrl + '&attachments=1', '_blank');
                                }
                                Lampa.Noty.show('Ссылка отправлена на скачивание');
                            } else {
                                // Обычное воспроизведение
                                Lampa.Player.play({
                                    url: directStreamUrl,
                                    title: post.title
                                });
                            }
                        }, function (errorMessage) {
                            Lampa.Noty.show(errorMessage);
                        });
                    } else {
                        Lampa.Noty.show('Ссылка на видео не найдена или пост закрыт подпиской.');
                    }
                };

                // Действие по обычному клику (Ввод/ОК) — сразу запускаем плеер
                card.on('hover:enter', function () {
                    handleAction('play');
                });

                // Действие по долгому нажатию (Вызов меню альтернативных действий)
                card.on('hover:long', function () {
                    Lampa.Select.show({
                        title: post.title,
                        items: [
                            { title: 'Смотреть онлайн', action: 'play' },
                            { title: 'Скачать видеофайл', action: 'download' },
                            { title: 'Открыть оригинал на Boosty', action: 'open_boosty' },
                            { title: 'Отмена', action: 'close' }
                        ],
                        onSelect: function (item) {
                            if (item.action === 'play' || item.action === 'download') {
                                handleAction(item.action);
                            } else if (item.action === 'open_boosty') {
                                window.open('https://boosty.to' + post.id, '_blank');
                            }
                        }
                    });
                });

                container.append(card);
                items.push(card);
            });

            scroll.append(container);
            html.append(scroll.render());
            Lampa.Controller.enable('content');
        };

        this.start = function () {
            Lampa.Controller.add('content', {
                toggle: function () {},
                left: function () { Lampa.Controller.toggle('menu'); }
            });
            Lampa.Controller.enable('content');
        };

        this.render = function () { return html; };
        this.destroy = function () { html.remove(); scroll.destroy(); network.clear(); };
    }

    function init() {
        Lampa.Component.add('boosty_3d', Boosty3DComponent);

        Lampa.Menu.add({
            id: 'boosty_3d_menu',
            title: '3D Кинотеатр',
            icon: '<svg xmlns="http://w3.org" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0-2-.9-2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg>',
            component: 'boosty_3d',
            page: true
        });
    }

    if (window.Lampa) { init(); } 
    else { Lampa.Listener.follow('app', function (e) { if (e.type == 'ready') init(); }); }
})();
