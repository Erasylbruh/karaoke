import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Правообладателям — KaraokeCraft',
  description: 'Порядок подачи уведомлений о нарушении авторских и смежных прав на платформе KaraokeCraft.',
};

export default function CopyrightPage() {
  return (
    <div className="pg" style={{ maxWidth: 780 }}>
      <h1 className="pg-h">Информация для правообладателей</h1>
      <p className="pg-sub">Оперативное рассмотрение обращений по авторским и смежным правам.</p>

      <div className="card stack" style={{ lineHeight: 1.65, fontSize: 15 }}>
        <section>
          <h2 style={{ font: '700 18px var(--fd)', margin: '0 0 8px' }}>Позиция платформы</h2>
          <p className="mu" style={{ margin: 0 }}>
            KaraokeCraft уважает интеллектуальную собственность музыкантов, авторов текстов, издательств и звукозаписывающих компаний.
            Проекты в каталоге создаются пользователями самостоятельно; при получении обоснованного уведомления о нарушении прав спорный
            материал оперативно блокируется модераторами.
          </p>
        </section>

        <section>
          <h2 style={{ font: '700 18px var(--fd)', margin: '0 0 8px' }}>Как сообщить о нарушении</h2>
          <p className="mu" style={{ margin: '0 0 10px' }}>
            1. <b>Быстрая подача прямо со страницы трека:</b> откройте страницу спорного проекта и нажмите кнопку <b>«Пожаловаться»</b>,
            выбрав причину «Нарушение авторских прав» и указав ссылку на официальный релиз или подтверждение прав.
          </p>
          <p className="mu" style={{ margin: 0 }}>
            2. <b>Письменное обращение без регистрации в каталоге:</b> направьте уведомление в службу модерации с указанием прямой ссылки
            на страницу проекта (`/karaoke/...`), названия произведения, данных правообладателя и контакта для ответа на адрес{' '}
            <a href="mailto:abuse@karaokecraft.app" style={{ color: 'var(--ac)' }}>abuse@karaokecraft.app</a>.
          </p>
        </section>

        <section>
          <h2 style={{ font: '700 18px var(--fd)', margin: '0 0 8px' }}>Сроки реакции</h2>
          <p className="mu" style={{ margin: 0 }}>
            Обращения проверяются модераторами в приоритетном порядке. При подтверждении нарушения доступ к проекту прекращается, а к учётной
            записи нарушителя применяются предупреждения вплоть до полной блокировки согласно{' '}
            <Link href="/terms" style={{ color: 'var(--ac)' }}>Пользовательскому соглашению</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
