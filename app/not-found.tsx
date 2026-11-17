import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="pg" style={{ maxWidth: 560, textAlign: 'center', paddingTop: 96 }}>
      <p className="pill ac" style={{ marginBottom: 14 }}>Ошибка 404</p>
      <h1 className="pg-h">Страница не найдена</h1>
      <p className="pg-sub" style={{ maxWidth: 420, margin: '8px auto 24px' }}>
        Возможно, ссылка устарела, проект был удалён автором или адрес введён с опечаткой.
      </p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <Link href="/" className="bt pr">Перейти в каталог</Link>
        <Link href="/create" className="bt">Создать караоке</Link>
      </div>
    </div>
  );
}
