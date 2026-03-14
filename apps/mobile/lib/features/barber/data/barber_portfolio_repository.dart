import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/network/api_client.dart';
import 'package:tapr/features/barber/data/barber_portfolio_models.dart';
import 'package:tapr/features/barber/data/barber_profile_models.dart';

class BarberPortfolioRepository {
  BarberPortfolioRepository(this._dio);

  final Dio _dio;

  Future<PortfolioStats> fetchStats() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/barbers/me/portfolio/stats',
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    return PortfolioStats.fromJson(data);
  }

  Future<({List<PortfolioItemModel> items, int total})> fetchMyPortfolio(
    String barberId, {
    int page = 1,
    int limit = 20,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/barbers/$barberId/portfolio',
      queryParameters: {'page': page, 'limit': limit},
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    final rawItems = data['items'] as List<dynamic>;
    final items = rawItems
        .map((e) => PortfolioItemModel.fromJson(e as Map<String, dynamic>))
        .toList();
    final total = (data['total'] as num).toInt();
    return (items: items, total: total);
  }

  Future<({String uploadUrl, String key})> getUploadUrl({
    required String fileName,
    required String mimeType,
    required String mediaType,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/barbers/me/portfolio/upload-url',
      data: {
        'fileName': fileName,
        'mimeType': mimeType,
        'mediaType': mediaType,
      },
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    return (
      uploadUrl: data['uploadUrl'] as String,
      key: data['key'] as String,
    );
  }

  Future<PortfolioItemModel> createPortfolioItem({
    required String key,
    required String mediaType,
    String? caption,
    List<String> tags = const [],
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/barbers/me/portfolio',
      data: {
        'key': key,
        'mediaType': mediaType,
        if (caption != null && caption.isNotEmpty) 'caption': caption,
        'tags': tags,
      },
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    return PortfolioItemModel.fromJson(data);
  }

  Future<PortfolioItemModel> updatePortfolioItem(
    String itemId, {
    String? caption,
    bool? isFeatured,
  }) async {
    final response = await _dio.patch<Map<String, dynamic>>(
      '/barbers/me/portfolio/$itemId',
      data: {
        if (caption != null) 'caption': caption,
        if (isFeatured != null) 'isFeatured': isFeatured,
      },
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    return PortfolioItemModel.fromJson(data);
  }

  Future<void> deletePortfolioItem(String itemId) async {
    await _dio.delete<Map<String, dynamic>>('/barbers/me/portfolio/$itemId');
  }
}

final barberPortfolioRepositoryProvider =
    Provider<BarberPortfolioRepository>((ref) {
  return BarberPortfolioRepository(ref.read(dioProvider));
});
