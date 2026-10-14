// @ts-nocheck -- CRA does not load Jest globals during the development type check.
import { createComment, createReply, reportComment } from './commentService';
import { reportCommentAsAdmin } from './commentAdminService';
import { executeRecaptcha } from '../utils/recaptcha';

jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { getIdToken: async () => 'test-auth' } }) }));
jest.mock('../utils/recaptcha', () => ({ ...jest.requireActual('../utils/recaptcha'), loadRecaptchaScript: jest.fn(async () => {}), executeRecaptcha: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { error: jest.fn() } }));

// No Firebase, Google, HTTP, or database writes. The fake verifier uses the
// deployed Functions contract: expectedAction defaults to "comment".
describe('comment submission reCAPTCHA contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    executeRecaptcha.mockImplementation(async (action) => `test-token:${action}`);
    global.fetch = jest.fn(async (_url, options) => {
      const valid = options.headers['x-recaptcha-token'] === 'test-token:comment';
      return { ok: valid, json: async () => valid
        ? { comment: { commentId: 'test-only', createdAt: '2026-10-14', updatedAt: '2026-10-14' } }
        : { error: 'reCAPTCHA 인증에 실패했습니다' } };
    });
  });
  it.each([
    ['create', () => createComment('test-person', { content: '테스트 문의 내용입니다', type: 'question', isAnonymous: false })],
    ['reply', () => createReply('test-comment', { content: '테스트 답글 내용입니다', isAnonymous: false })],
    ['report', () => reportComment('test-comment', 'spam')],
    ['admin report', () => reportCommentAsAdmin('test-comment', 'spam')],
  ])('%s passes the same action to Google and the server', async (_name, submit) => {
    await submit();
    expect(executeRecaptcha).toHaveBeenCalledWith('comment');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].headers['x-recaptcha-action']).toBe('comment');
  });
  it('never submits when token generation fails', async () => {
    executeRecaptcha.mockRejectedValueOnce(new Error('token unavailable'));
    await expect(createComment('test-person', { content: '테스트 문의 내용입니다', type: 'question', isAnonymous: false })).rejects.toThrow('token unavailable');
    expect(fetch).not.toHaveBeenCalled();
  });
});
