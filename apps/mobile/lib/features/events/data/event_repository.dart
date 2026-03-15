import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/network/api_client.dart';
import 'package:tapr/features/events/data/event_models.dart';

class EventRepository {
  EventRepository(this._dio);

  final Dio _dio;

  Future<EventsListResult> fetchEvents({
    double? lat,
    double? lng,
    int radiusKm = 50,
    EventType? type,
    String? organizerId,
    DateTime? from,
    DateTime? to,
    int page = 1,
    int limit = 20,
  }) async {
    final queryParams = <String, dynamic>{
      'page': page,
      'limit': limit,
      if (type != null) 'type': type.apiValue,
      if (organizerId != null) 'organizerId': organizerId,
      if (from != null) 'from': from.toUtc().toIso8601String(),
      if (to != null) 'to': to.toUtc().toIso8601String(),
    };
    if (lat != null && lng != null) {
      queryParams['lat'] = lat;
      queryParams['lng'] = lng;
      queryParams['radiusKm'] = radiusKm;
    }

    final response = await _dio.get<Map<String, dynamic>>(
      '/events',
      queryParameters: queryParams,
    );
    final data = response.data!['data'] as List<dynamic>;
    final meta = response.data!['meta'] as Map<String, dynamic>?;
    final pagination = meta?['pagination'] as Map<String, dynamic>?;

    final events = data
        .map((e) => EventListItem.fromJson(e as Map<String, dynamic>))
        .toList();

    return EventsListResult(
      events: events,
      page: (pagination?['page'] as num?)?.toInt() ?? page,
      limit: (pagination?['limit'] as num?)?.toInt() ?? limit,
      total: (pagination?['total'] as num?)?.toInt() ?? events.length,
      totalPages: (pagination?['totalPages'] as num?)?.toInt() ?? 1,
    );
  }

  Future<EventDetail> fetchEventDetail(String id) async {
    final response = await _dio.get<Map<String, dynamic>>('/events/$id');
    final data = response.data!['data'] as Map<String, dynamic>;
    return EventDetail.fromJson(data);
  }

  Future<void> attendEvent(String id) async {
    await _dio.post<Map<String, dynamic>>('/events/$id/attend');
  }

  Future<void> unattendEvent(String id) async {
    await _dio.delete<Map<String, dynamic>>('/events/$id/attend');
  }

  Future<EventListItem> createEvent(CreateEventBody body) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/events',
      data: body.toJson(),
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    return EventListItem.fromJson(data);
  }

  Future<CoverImageUploadResult> fetchCoverImageUploadUrl(
    String eventId, {
    required String fileName,
    required String mimeType,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/events/$eventId/cover-image-upload-url',
      data: {'fileName': fileName, 'mimeType': mimeType},
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    return CoverImageUploadResult(
      uploadUrl: data['uploadUrl'] as String,
      key: data['key'] as String,
      cdnUrl: data['cdnUrl'] as String,
    );
  }

  Future<void> uploadCoverImage(String eventId, File file) async {
    final ext = file.path.split('.').last.toLowerCase();
    final mimeType = switch (ext) {
      'jpg' || 'jpeg' => 'image/jpeg',
      'png' => 'image/png',
      'webp' => 'image/webp',
      _ => 'image/jpeg',
    };
    final result = await fetchCoverImageUploadUrl(
      eventId,
      fileName: file.path.split('/').last,
      mimeType: mimeType,
    );

    await _dio.put(
      result.uploadUrl,
      data: await file.readAsBytes(),
      options: Options(
        headers: {'Content-Type': mimeType},
        contentType: mimeType,
      ),
    );

    await _dio.patch<Map<String, dynamic>>(
      '/events/$eventId',
      data: {'coverImageUrl': result.cdnUrl},
    );
  }
}

class EventsListResult {
  const EventsListResult({
    required this.events,
    required this.page,
    required this.limit,
    required this.total,
    required this.totalPages,
  });

  final List<EventListItem> events;
  final int page;
  final int limit;
  final int total;
  final int totalPages;
}

class CreateEventBody {
  const CreateEventBody({
    required this.title,
    this.description,
    required this.eventType,
    required this.locationAddress,
    required this.lat,
    required this.lng,
    required this.startsAt,
    required this.endsAt,
    this.maxAttendees,
    this.ticketPriceCents = 0,
    this.hasFoodTrucks = false,
  });

  final String title;
  final String? description;
  final EventType eventType;
  final String locationAddress;
  final double lat;
  final double lng;
  final DateTime startsAt;
  final DateTime endsAt;
  final int? maxAttendees;
  final int ticketPriceCents;
  final bool hasFoodTrucks;

  Map<String, dynamic> toJson() => {
        'title': title,
        if (description != null) 'description': description,
        'eventType': eventType.apiValue,
        'locationAddress': locationAddress,
        'lat': lat,
        'lng': lng,
        'startsAt': startsAt.toUtc().toIso8601String(),
        'endsAt': endsAt.toUtc().toIso8601String(),
        if (maxAttendees != null) 'maxAttendees': maxAttendees,
        'ticketPriceCents': ticketPriceCents,
        'hasFoodTrucks': hasFoodTrucks,
      };
}

class CoverImageUploadResult {
  const CoverImageUploadResult({
    required this.uploadUrl,
    required this.key,
    required this.cdnUrl,
  });

  final String uploadUrl;
  final String key;
  final String cdnUrl;
}

final eventRepositoryProvider = Provider<EventRepository>((ref) {
  return EventRepository(ref.read(dioProvider));
});
