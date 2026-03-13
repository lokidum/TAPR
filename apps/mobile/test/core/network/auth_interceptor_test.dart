import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:tapr/core/network/auth_interceptor.dart';
import 'package:tapr/core/network/token_storage.dart';

class MockTokenStorage extends Mock implements TokenStorage {}

class MockAdapter extends Mock implements HttpClientAdapter {}

void main() {
  late MockTokenStorage mockStorage;
  late MockAdapter mockAdapter;
  late Dio dio;
  late bool authFailureCalled;

  setUpAll(() {
    registerFallbackValue(RequestOptions(path: ''));
  });

  setUp(() {
    mockStorage = MockTokenStorage();
    mockAdapter = MockAdapter();
    authFailureCalled = false;

    dio = Dio(BaseOptions(baseUrl: 'https://api.test.com'));
    dio.httpClientAdapter = mockAdapter;

    when(() => mockStorage.clearAll()).thenAnswer((_) async {});
  });

  tearDown(() {
    dio.close(force: true);
  });

  ResponseBody jsonResponse(Map<String, dynamic> data, {int statusCode = 200}) {
    final jsonStr = jsonEncode(data);
    return ResponseBody.fromString(jsonStr, statusCode, headers: {
      'content-type': ['application/json'],
    });
  }

  group('AuthInterceptor', () {
    test('attaches Bearer token to outgoing requests', () async {
      when(() => mockStorage.getAccessToken())
          .thenAnswer((_) async => 'my-token');

      when(() => mockAdapter.fetch(any(), any(), any()))
          .thenAnswer((invocation) async {
        final options = invocation.positionalArguments[0] as RequestOptions;
        expect(options.headers['Authorization'], equals('Bearer my-token'));
        return jsonResponse({'ok': true});
      });

      dio.interceptors.add(AuthInterceptor(
        tokenStorage: mockStorage,
        dio: dio,
        onAuthFailure: () => authFailureCalled = true,
      ));

      await dio.get<dynamic>('/test');
      verify(() => mockStorage.getAccessToken()).called(1);
    });

    test('sends request without auth when no token stored', () async {
      when(() => mockStorage.getAccessToken())
          .thenAnswer((_) async => null);

      when(() => mockAdapter.fetch(any(), any(), any()))
          .thenAnswer((invocation) async {
        final options = invocation.positionalArguments[0] as RequestOptions;
        expect(options.headers['Authorization'], isNull);
        return jsonResponse({'ok': true});
      });

      dio.interceptors.add(AuthInterceptor(
        tokenStorage: mockStorage,
        dio: dio,
      ));

      await dio.get<dynamic>('/test');
    });

    test('refreshes token on 401 and retries the request', () async {
      when(() => mockStorage.getAccessToken())
          .thenAnswer((_) async => 'expired-token');
      when(() => mockStorage.getRefreshToken())
          .thenAnswer((_) async => 'valid-refresh');
      when(() => mockStorage.saveAccessToken(any()))
          .thenAnswer((_) async {});
      when(() => mockStorage.saveRefreshToken(any()))
          .thenAnswer((_) async {});

      var requestCount = 0;
      when(() => mockAdapter.fetch(any(), any(), any()))
          .thenAnswer((invocation) async {
        final options = invocation.positionalArguments[0] as RequestOptions;
        requestCount++;

        if (options.path.contains('/auth/refresh')) {
          return jsonResponse({
            'data': {
              'accessToken': 'new-token',
              'refreshToken': 'new-refresh',
            },
          });
        }

        if (requestCount == 1) {
          return jsonResponse({'error': 'unauthorized'}, statusCode: 401);
        }

        expect(options.headers['Authorization'], equals('Bearer new-token'));
        return jsonResponse({'data': 'retried-success'});
      });

      dio.interceptors.add(AuthInterceptor(
        tokenStorage: mockStorage,
        dio: dio,
        onAuthFailure: () => authFailureCalled = true,
      ));

      final response = await dio.get<dynamic>('/protected');

      expect(response.statusCode, equals(200));
      verify(() => mockStorage.saveAccessToken('new-token')).called(1);
      verify(() => mockStorage.saveRefreshToken('new-refresh')).called(1);
      expect(authFailureCalled, isFalse);
    });

    test('calls onAuthFailure when no refresh token available', () async {
      when(() => mockStorage.getAccessToken())
          .thenAnswer((_) async => 'expired-token');
      when(() => mockStorage.getRefreshToken())
          .thenAnswer((_) async => null);

      when(() => mockAdapter.fetch(any(), any(), any()))
          .thenAnswer((_) async {
        return jsonResponse({'error': 'unauthorized'}, statusCode: 401);
      });

      dio.interceptors.add(AuthInterceptor(
        tokenStorage: mockStorage,
        dio: dio,
        onAuthFailure: () => authFailureCalled = true,
      ));

      try {
        await dio.get<dynamic>('/protected');
        fail('Should have thrown');
      } on DioException catch (e) {
        expect(e.response?.statusCode, equals(401));
      }

      expect(authFailureCalled, isTrue);
      verify(() => mockStorage.clearAll()).called(1);
    });

    test('calls onAuthFailure when refresh endpoint itself fails', () async {
      when(() => mockStorage.getAccessToken())
          .thenAnswer((_) async => 'expired-token');
      when(() => mockStorage.getRefreshToken())
          .thenAnswer((_) async => 'bad-refresh');

      when(() => mockAdapter.fetch(any(), any(), any()))
          .thenAnswer((invocation) async {
        final options = invocation.positionalArguments[0] as RequestOptions;

        if (options.path.contains('/auth/refresh')) {
          return jsonResponse({'error': 'invalid'}, statusCode: 401);
        }

        return jsonResponse({'error': 'unauthorized'}, statusCode: 401);
      });

      dio.interceptors.add(AuthInterceptor(
        tokenStorage: mockStorage,
        dio: dio,
        onAuthFailure: () => authFailureCalled = true,
      ));

      try {
        await dio.get<dynamic>('/protected');
        fail('Should have thrown');
      } on DioException catch (e) {
        expect(e.response?.statusCode, equals(401));
      }

      expect(authFailureCalled, isTrue);
      verify(() => mockStorage.clearAll()).called(1);
    });

    test('does not attempt refresh for non-401 errors', () async {
      when(() => mockStorage.getAccessToken())
          .thenAnswer((_) async => 'my-token');

      when(() => mockAdapter.fetch(any(), any(), any()))
          .thenAnswer((_) async {
        return jsonResponse({'error': 'forbidden'}, statusCode: 403);
      });

      dio.interceptors.add(AuthInterceptor(
        tokenStorage: mockStorage,
        dio: dio,
        onAuthFailure: () => authFailureCalled = true,
      ));

      try {
        await dio.get<dynamic>('/test');
        fail('Should have thrown');
      } on DioException catch (e) {
        expect(e.response?.statusCode, equals(403));
      }

      verifyNever(() => mockStorage.getRefreshToken());
      expect(authFailureCalled, isFalse);
    });
  });
}
