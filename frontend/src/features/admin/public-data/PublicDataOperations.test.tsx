// @ts-nocheck -- CRA's development compiler does not load Jest globals for colocated tests.
import React from 'react';
import {act} from 'react-dom/test-utils';
import {createRoot,type Root} from 'react-dom/client';
import PublicDataOperations from './PublicDataOperations';
import {loadPublicDataOverview} from '../../../services/publicDataAdminService';

jest.mock('../../../services/publicDataAdminService',()=>({loadPublicDataOverview:jest.fn(),listPublicDataSyncRuns:jest.fn().mockResolvedValue([]),listDataQualityIssues:jest.fn().mockResolvedValue([]),listImpactDrafts:jest.fn().mockResolvedValue([]),listPublicDataAudit:jest.fn().mockResolvedValue([]),listPublicDataSources:jest.fn().mockResolvedValue([]),runStatisticsImport:jest.fn(),publishImpactDraft:jest.fn(),rejectImpactDraft:jest.fn(),changeDataQualityIssueStatus:jest.fn()}));
const empty={reportModerator:false,seniorModerator:false,agencyOperator:false,privacyOfficer:false,systemAdmin:false};

describe('PublicDataOperations role guard',()=>{let container:HTMLDivElement;let root:Root;beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;window.history.replaceState({},'','/admin');container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});afterEach(()=>{act(()=>root.unmount());container.remove();jest.clearAllMocks();});
it('does not grant public-data access to privacyOfficer alone',()=>{act(()=>root.render(<PublicDataOperations roles={{...empty,privacyOfficer:true}}/>));expect(container.textContent).toContain('공공데이터 운영 권한 없음');expect(loadPublicDataOverview).not.toHaveBeenCalled();});
it('shows the open issue count to an analyst role',async()=>{(loadPublicDataOverview as jest.Mock).mockResolvedValue({openIssueCount:3,latestByType:{},latestImpactDraft:null});await act(async()=>{root.render(<PublicDataOperations roles={{...empty,reportModerator:true}}/>);await Promise.resolve();await Promise.resolve();});expect(container.textContent).toContain('열린 데이터품질 이슈');expect(container.textContent).toContain('3');expect(container.textContent).not.toContain('확정 Import');});});
