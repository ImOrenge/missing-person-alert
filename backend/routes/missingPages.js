const express = require('express');
const firebaseService = require('../services/firebaseService');

const router = express.Router();

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'number') {
    return new Date(value);
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      return value.toDate();
    }
    if (typeof value.toMillis === 'function') {
      return new Date(value.toMillis());
    }
    if (typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000);
    }
  }

  return null;
}

function formatKoreanDate(value) {
  const date = toDate(value);
  if (!date) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date);
  } catch {
    return date.toISOString().split('T')[0];
  }
}

function getStatusLabel(status) {
  switch (status) {
    case 'active':
      return '수색중';
    case 'investigating':
      return '조사중';
    case 'found':
      return '발견 완료';
    default:
      return '상태 미상';
  }
}

function buildMetaDescription(person) {
  const parts = [];
  if (person.name) {
    parts.push(`${person.name} 실종자 정보`);
  }

  const details = [];
  if (typeof person.age === 'number' && person.age > 0) {
    details.push(`${person.age}세`);
  }
  if (typeof person.gender === 'string' && person.gender.trim()) {
    details.push(person.gender.trim());
  }
  if (person.location?.address) {
    details.push(person.location.address);
  }
  if (details.length > 0) {
    parts.push(details.join(' · '));
  }
  if (person.description) {
    parts.push(person.description);
  }

  const raw = parts.join(' | ');
  return raw.length > 160 ? `${raw.slice(0, 157)}...` : raw;
}

function normalizePerson(person = {}, id) {
  const normalized = {
    id: person.id || id,
    name: person.name || '이름 미상',
    age: typeof person.age === 'number' ? person.age : Number(person.age) || null,
    gender: typeof person.gender === 'string' ? person.gender : null,
    location: {
      address: person.location?.address || '',
      lat: Number(person.location?.lat) || null,
      lng: Number(person.location?.lng) || null
    },
    description: person.description || '',
    missingDate: person.missingDate,
    type: person.type || null,
    status: person.status || null,
    photos: Array.isArray(person.photos) ? person.photos : [],
    photo: typeof person.photo === 'string' ? person.photo : null,
    updatedAt: person.updatedAt,
    source: person.source || null,
    commentCount:
      typeof person.commentCount === 'number'
        ? person.commentCount
        : typeof person.commentsCount === 'number'
        ? person.commentsCount
        : typeof person.commentStats?.total === 'number'
        ? person.commentStats.total
        : null,
    commentStats: person.commentStats || null
  };

  if (!normalized.photo && normalized.photos.length > 0) {
    [normalized.photo] = normalized.photos;
  }

  return normalized;
}

function buildStructuredData(person, url) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${url}#person`,
    name: person.name,
    identifier: person.id,
    url,
    description: buildMetaDescription(person),
    gender: person.gender || undefined,
    image: person.photo || undefined,
    address: person.location?.address ? {
      '@type': 'PostalAddress',
      streetAddress: person.location.address
    } : undefined,
    sameAs: person.source ? [person.source] : undefined,
    additionalProperty: []
  };

  const missingOn = formatKoreanDate(person.missingDate);
  if (missingOn) {
    data.additionalProperty.push({
      '@type': 'PropertyValue',
      name: 'missingDate',
      value: missingOn
    });
  }

  if (typeof person.age === 'number' && person.age > 0) {
    data.additionalProperty.push({
      '@type': 'PropertyValue',
      name: 'age',
      value: person.age
    });
  }

  if (person.type) {
    data.additionalProperty.push({
      '@type': 'PropertyValue',
      name: 'type',
      value: person.type
    });
  }

  if (person.status) {
    data.additionalProperty.push({
      '@type': 'PropertyValue',
      name: 'status',
      value: person.status
    });
  }

  if (person.location?.lat && person.location?.lng) {
    data.geo = {
      '@type': 'GeoCoordinates',
      latitude: person.location.lat,
      longitude: person.location.lng
    };
  }

  if (data.additionalProperty.length === 0) {
    delete data.additionalProperty;
  }

  if (typeof person.commentCount === 'number' && person.commentCount >= 0) {
    data.interactionStatistic = {
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/CommentAction',
      userInteractionCount: person.commentCount
    };
  }

  return JSON.stringify(data);
}

router.get('/missing/:id', async (req, res) => {
  const personId = req.params.id;

  try {
    const personData = await firebaseService.getMissingPerson(personId);

    if (!personData) {
      res.status(404).send(`<html lang="ko"><head><meta charset="utf-8"><title>실종자 정보를 찾을 수 없습니다</title><meta name="robots" content="noindex"></head><body><h1>실종자 정보를 찾을 수 없습니다</h1><p>요청하신 실종자 게시물이 존재하지 않거나 삭제되었습니다.</p></body></html>`);
      return;
    }

    const person = normalizePerson(personData, personId);
    const canonicalUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const metaDescription = escapeHtml(buildMetaDescription(person));
    const ogImage = person.photo ? escapeHtml(person.photo) : null;
    const missingDateLabel = formatKoreanDate(person.missingDate);
    const updatedAtLabel = formatKoreanDate(person.updatedAt);
    const structuredData = buildStructuredData(person, canonicalUrl);
    const commentCount =
      typeof person.commentCount === 'number'
        ? person.commentCount
        : typeof person.commentStats?.total === 'number'
        ? person.commentStats.total
        : null;

    const content = `
<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(person.name)} 실종자 정보</title>
    <meta name="description" content="${metaDescription}">
    <meta name="robots" content="index,follow">
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
    <meta property="og:type" content="article">
    <meta property="og:locale" content="ko_KR">
    <meta property="og:title" content="${escapeHtml(person.name)} 실종자 정보">
    <meta property="og:description" content="${metaDescription}">
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
    ${ogImage ? `<meta property="og:image" content="${ogImage}">` : ''}
    <meta property="article:published_time" content="${escapeHtml(person.missingDate || '')}">
    ${updatedAtLabel ? `<meta property="article:modified_time" content="${escapeHtml(person.updatedAt || '')}">` : ''}
    <script type="application/ld+json">${structuredData}</script>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 24px; background: #f4f4f5; color: #111827; }
      main { max-width: 720px; margin: 0 auto; background: #ffffff; border-radius: 16px; box-shadow: 0 20px 45px rgba(15, 23, 42, 0.12); overflow: hidden; }
      header { padding: 32px 32px 24px; border-bottom: 1px solid #e5e7eb; }
      header h1 { margin: 0 0 12px; font-size: 28px; font-weight: 700; }
      header p { margin: 4px 0; color: #4b5563; font-size: 15px; }
      .meta { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 12px; padding: 12px; background: #f9fafb; border-radius: 12px; font-size: 14px; color: #374151; }
      figure { margin: 0; }
      figure img { width: 100%; height: auto; display: block; }
      .content { padding: 24px 32px; line-height: 1.7; font-size: 16px; }
      dl { display: grid; grid-template-columns: 140px 1fr; gap: 12px 18px; margin: 0 0 24px; }
      dt { font-weight: 600; color: #1f2937; }
      dd { margin: 0; color: #374151; }
      .description { white-space: pre-line; margin-top: 24px; color: #111827; }
      .footer { padding: 20px 32px 28px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; display: flex; flex-direction: column; gap: 12px; }
      .footer a { color: #dc2626; text-decoration: none; font-weight: 600; }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>${escapeHtml(person.name)} 실종자 게시물</h1>
        <div class="meta">
          <span>게시물 번호: ${escapeHtml(person.id)}</span>
          ${missingDateLabel ? `<span>실종일: ${escapeHtml(missingDateLabel)}</span>` : ''}
          ${updatedAtLabel ? `<span>업데이트: ${escapeHtml(updatedAtLabel)}</span>` : ''}
          ${person.type ? `<span>구분: ${escapeHtml(person.type)}</span>` : ''}
          ${person.status ? `<span>상태: ${escapeHtml(getStatusLabel(person.status))}</span>` : ''}
          ${commentCount !== null ? `<span>댓글: ${escapeHtml(String(commentCount))}건</span>` : ''}
        </div>
        ${person.location?.address ? `<p>마지막 확인 위치: ${escapeHtml(person.location.address)}</p>` : ''}
      </header>
      ${person.photo ? `<figure><img src="${escapeHtml(person.photo)}" alt="${escapeHtml(person.name)} 사진"></figure>` : ''}
      <section class="content">
        <dl>
          <dt>이름</dt>
          <dd>${escapeHtml(person.name)}</dd>
          ${typeof person.age === 'number' && person.age > 0 ? `<dt>나이</dt><dd>${escapeHtml(person.age)}</dd>` : ''}
          ${person.gender ? `<dt>성별</dt><dd>${escapeHtml(person.gender)}</dd>` : ''}
          ${person.location?.address ? `<dt>위치</dt><dd>${escapeHtml(person.location.address)}</dd>` : ''}
          ${person.source ? `<dt>출처</dt><dd>${escapeHtml(person.source)}</dd>` : ''}
        </dl>
        ${person.description ? `<div class="description">${escapeHtml(person.description)}</div>` : ''}
      </section>
      <footer class="footer">
        <div>본 게시물은 실종자 알림 시스템에서 자동 생성되었습니다.</div>
        <a href="/">실시간 실종자 알림 서비스로 돌아가기</a>
      </footer>
    </main>
  </body>
</html>`;

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(content);
  } catch (error) {
    console.error('❌ 실종자 SEO 페이지 생성 실패:', error);
    res.status(500).send(`<html lang="ko"><head><meta charset="utf-8"><title>서버 오류</title><meta name="robots" content="noindex"></head><body><h1>서버 오류가 발생했습니다</h1><p>잠시 후 다시 시도해 주세요.</p></body></html>`);
  }
});

module.exports = router;
