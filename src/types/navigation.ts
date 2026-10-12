export type RootStackParamList = {
  Auth: undefined;
  Home: undefined;
  RoomDetail: {
    roomId: string;
    roomName: string;
  };
  AddDevice: {
    roomName?: string;
  };
};