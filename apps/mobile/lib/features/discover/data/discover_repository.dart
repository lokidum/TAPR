import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/network/api_client.dart';
import 'package:tapr/features/discover/data/discover_models.dart';

class DiscoverRepository {
  DiscoverRepository(this._dio);

  final Dio _dio;

  Future<({List<FeedItem> items, int total})> fetchFeed({
    required double lat,
    required double lng,
    int page = 1,
    int limit = 10,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/barbers/nearby/feed',
      queryParameters: {
        'lat': lat,
        'lng': lng,
        'page': page,
        'limit': limit,
      },
    );

    final data = response.data!['data'] as Map<String, dynamic>;
    final rawItems = data['items'] as List<dynamic>;
    final items = rawItems
        .map((e) => FeedItem.fromJson(e as Map<String, dynamic>))
        .toList();
    final total = (data['total'] as num).toInt();

    return (items: items, total: total);
  }

  Future<List<NearbyBarber>> fetchNearbyBarbers({
    required double lat,
    required double lng,
    double radiusKm = 10,
    int? minLevel,
    int? maxLevel,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/barbers/nearby',
      queryParameters: {
        'lat': lat,
        'lng': lng,
        'radiusKm': radiusKm,
        if (minLevel != null) 'minLevel': minLevel,
        if (maxLevel != null) 'maxLevel': maxLevel,
      },
    );

    final data = response.data!['data'] as List<dynamic>;
    return data
        .map((e) => NearbyBarber.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<int> likeItem(String barberId, String itemId) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/barbers/$barberId/portfolio/$itemId/like',
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    return (data['likeCount'] as num).toInt();
  }

  Future<int> unlikeItem(String barberId, String itemId) async {
    final response = await _dio.delete<Map<String, dynamic>>(
      '/barbers/$barberId/portfolio/$itemId/like',
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    return (data['likeCount'] as num).toInt();
  }
}

final discoverRepositoryProvider = Provider<DiscoverRepository>((ref) {
  return DiscoverRepository(ref.read(dioProvider));
});
