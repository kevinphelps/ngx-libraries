import { HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { Injectable, Provider } from '@angular/core';
import { async, inject, TestBed } from '@angular/core/testing';
import { TestingSubscriptionTracker } from 'subscription-tracker';

import { HTTP_REQUEST_RETRY_STRATEGIES } from './ngx-http-retry.di-tokens';
import { HttpRequestRetryStrategy } from './ngx-http-retry.helpers';
import { attemptNumberHeader, ngxHttpRetryInterceptorProvider } from './ngx-http-retry.interceptor';

@Injectable()
export class ServerUnavailableRetryStrategy implements HttpRequestRetryStrategy {
  // retry if the server is temporarily unavailable (e.g. for maintenance)
  readonly statuses = [502, 503];
  readonly maxCount = 10;

  delayFn() {
    return 0;
  }
}

export const serverUnavailableRetryStrategyProvider: Provider = {
  provide: HTTP_REQUEST_RETRY_STRATEGIES,
  useClass: ServerUnavailableRetryStrategy,
  multi: true
};

describe('NgxHttpRetryInterceptor', () => {
  const subscriptionTracker = new TestingSubscriptionTracker();

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ngxHttpRetryInterceptorProvider, serverUnavailableRetryStrategyProvider]
    });
  });

  afterEach(() => {
    subscriptionTracker.destroy();
  });

  afterEach(
    inject([HttpTestingController], (httpMock: HttpTestingController) => {
      httpMock.verify();
    })
  );

  it(
    'should send the correct attempt number header',
    async(
      inject([HttpClient, HttpTestingController], async (httpClient: HttpClient, httpMock: HttpTestingController) => {
        httpClient.get('/api/people').subscribeAndTrack(subscriptionTracker);

        (await expectOneRequest(httpMock, '/api/people', 1)).flush(null, { status: 502, statusText: 'Bad Gateway' });
        (await expectOneRequest(httpMock, '/api/people', 2)).flush(null, { status: 502, statusText: 'Bad Gateway' });
        (await expectOneRequest(httpMock, '/api/people', 3)).flush(null, { status: 502, statusText: 'Bad Gateway' });
        (await expectOneRequest(httpMock, '/api/people', 4)).flush(null, { status: 502, statusText: 'Bad Gateway' });
        (await expectOneRequest(httpMock, '/api/people', 5)).flush(null, { status: 200, statusText: 'OK' });
      })
    )
  );
});

function expectOneRequest(httpMock: HttpTestingController, url: string, expectedAttemptNumber?: number) {
  return new Promise<TestRequest>(resolve => {
    setTimeout(() => {
      const testRequest = httpMock.expectOne(url);

      if (expectedAttemptNumber !== undefined) {
        const attemptNumber = +testRequest.request.headers.get(attemptNumberHeader);
        expect(attemptNumber).toBe(expectedAttemptNumber);
      }

      resolve(testRequest);
    }, 0);
  });
}