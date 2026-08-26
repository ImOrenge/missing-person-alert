# MissingAlert Public Impact evidence

이 폴더는 운영 월별 증거팩의 구조와 템플릿만 관리한다. 실제 BigQuery export, 관리자 UID, 원본 사건키, 제보 내용, 토큰이나 개인정보를 Git에 저장하지 않는다.

운영 증거팩은 `evidence/YYYY-MM/` 구조로 별도 보호 저장소에 만들고 다음 파일을 갖춘다.

```text
impact-summary.json
bigquery-raw-counts.json
bigquery-query-version.txt
source-status.json
sync-run-summary.json
screenshot-statistics.png
screenshot-impact.png
data-quality-summary.md
approval-record.json
```

로컬 검증:

```powershell
node scripts/validate-impact-evidence.mjs evidence/2026-08
```

`impact-summary.json`은 공개 승인 snapshot 그대로 내보내고 `bigquery-raw-counts.json`은 같은 query version으로 재실행한 월 원시 이벤트 수를 기록한다. `approval-record.json`은 승인 상태와 공개 여부를 증명해야 한다. 수동으로 숫자를 입력해 맞추지 않는다.
