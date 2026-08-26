// @ts-nocheck -- CRA's development compiler does not load Jest globals for colocated tests.
import {generateShareUrls, generateWebShareData, getMissingPersonShareUrl} from './shareUtils';

const person = {id: 'case/한글', name: '테스트', age: 10, gender: 'M', type: 'missing_child', location: {address: '서울'}, missingDate: '2026-08-01'} as any;

describe('public share URL contract', () => {
  it('routes native and SNS sharing through the crawler-rendered share path', () => {
    const shareUrl = getMissingPersonShareUrl(person.id);
    expect(shareUrl).toContain('/share/case%2F%ED%95%9C%EA%B8%80');
    expect(shareUrl).not.toContain('/missing/case');
    expect(generateWebShareData({person}).url).toBe(shareUrl);
    expect(decodeURIComponent(generateShareUrls({person}).facebook)).toContain(shareUrl);
  });
});
