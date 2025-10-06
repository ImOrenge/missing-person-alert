<%@ page language="java" contentType="text/html; charset=UTF-8"
    pageEncoding="UTF-8"%>
<%@page import="java.net.URL"%>
<%@page import="java.net.URLConnection"%>
<%@page import="java.io.OutputStreamWriter"%>
<%@page import="java.io.InputStreamReader"%>
<%@page import="java.io.BufferedReader"%>
<%@page import="java.net.MalformedURLException"%>
<%@page import="java.io.IOException"%>

<%
    String esntlId = "10011616";
    String authKey = "d4dce53abbc84060";
    String rowSize = "10";
    String pageNum = "1";
    String[] writngTrgetDscds = {"010", "060", "070"};
    String sexdstnDscd = "";
    String nm = "";
    String detailDate1 = "";
    String detailDate2 = "";
    String age1 = "";
    String age2 = "";
    String occrAdres = "";
    String xmlUseYN = "";

    String urlStr = "https://www.safe182.go.kr/api/lcm/amberList.do";

    String params = "esntlId=";
    params += esntlId;
    params += "&authKey=";
    params += authKey;
    params += "&rowSize=";
    params += rowSize;
    params += "&page=";
    params += pageNum;

    for(int i=0; i<writngTrgetDscds.length; i++){
        params += "&writngTrgetDscds=";
        params += writngTrgetDscds[i];
    }

    params += "&sexdstnDscd=";
    params += sexdstnDscd;
    params += "&nm=";
    params += nm;
    params += "&detailDate1=";
    params += detailDate1;
    params += "&detailDate2=";
    params += detailDate2;
    params += "&age1=";
    params += age1;
    params += "&age2=";
    params += age2;
    params += "&occrAdres=";
    params += occrAdres;
    params += "&xmlUseYN=";
    params += xmlUseYN;

    URL url;
    URLConnection connection;
    OutputStreamWriter wr = null;
    InputStreamReader isr = null;
    BufferedReader br = null;

    String result = "";

    try{
        url = new URL(urlStr);
        connection = url.openConnection();
        connection.setDoOutput(true);

        wr = new OutputStreamWriter(connection.getOutputStream());
        wr.write(params);
        wr.flush();

        isr = new InputStreamReader(connection.getInputStream(), "utf-8");
        br = new BufferedReader(isr);
        String buf = "";

        while(true){
             buf = br.readLine();
             if(buf == null){
                 break;
             }else{
                 result = buf;
             }
         }

     } catch(MalformedURLException e){
         e.printStackTrace();
     } catch(IOException ioe){
         ioe.printStackTrace();
     } finally {
         wr.close();
         isr.close();
         br.close();
     }

%>

<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ko" lang="ko">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title>실종경보 OPEN API 테스트</title>
<style type="text/css">
body {margin:0px; padding:0px; font-size:12px; font-family:"돋움",Dotum,Helvetica,AppleGothic,Sans-serif; line-height:1.5em; color:#666;}
</style>
<script type="text/javascript" src="/static/home/js/jquery.js"></script>
<script type="text/javascript">
    var resultStr = '<%= result %>';
    var jsonObject = jQuery.parseJSON(resultStr.replace(/\s/g, "<br />"));

    var _result = jsonObject.result;
    var _msg = jsonObject.msg;
    var _totalCount = jsonObject.totalCount;
    var _list = jsonObject.list;

    document.write("<p> result : " + _result + ", msg : " + _msg + ", totalCount : " + _totalCount + "</p>");
    document.write("<table border='1' width='100%'>");
    document.write("    <tr>");
    document.write("        <th>발생일시</th>");
    document.write("        <th>착의사항</th>");
    document.write("        <th>현재나이</th>");
    document.write("        <th>당시나이</th>");
    document.write("        <th>대상구분</th>");
    document.write("        <th>성별구분(여자, 남자)</th>");
    document.write("        <th>발생장소</th>");
    document.write("        <th>성명</th>");
    document.write("        <th>키</th>");
    document.write("        <th>몸무게</th>");
    document.write("        <th>체격</th>");
    document.write("        <th>얼굴형</th>");
    document.write("        <th>두발형태</th>");
    document.write("        <th>두발색상</th>");
    document.write("        <th>사진</th>");
    document.write("    </tr>");

    for(var i=0; i<_list.length; i++){
        document.write("    <tr>");
        document.write("        <td>" + _list[i].occrde + "</td>");
        document.write("        <td>" + _list[i].alldressingDscd + "</td>");
        document.write("        <td>" + _list[i].ageNow + "</td>");
        document.write("        <td>" + _list[i].age + "</td>");
        document.write("        <td>" + _list[i].writngTrgetDscd + "</td>");
        document.write("        <td>" + _list[i].sexdstnDscd + "</td>");
        document.write("        <td>" + _list[i].occrAdres + "</td>");
        document.write("        <td>" + _list[i].nm + "</td>");
        document.write("        <td>" + _list[i].height + "</td>");
        document.write("        <td>" + _list[i].bdwgh + "</td>");
        document.write("        <td>" + _list[i].frmDscd + "</td>");
        document.write("        <td>" + _list[i].faceshpeDscd + "</td>");
        document.write("        <td>" + _list[i].hairshpeDscd + "</td>");
        document.write("        <td>" + _list[i].haircolrDscd + "</td>");

        if( _list[i].tknphotolength != "0" )
            document.write("        <td><a href='https://www.safe182.go.kr/home/lcm/lcmMssGet.do?gnbMenuCd=014000000000&lnbMenuCd=014001000000&rptDscd=2&msspsnIdntfccd=" + _list[i].msspsnIdntfccd + "'><img style='width:96px;height:128px;' width='96' height='128' border='0' src='https://www.safe182.go.kr/api/lcm/imgView.do?msspsnIdntfccd=" + _list[i].msspsnIdntfccd + "'/></a></td>");
        else
            document.write("        <td> &nbsp; </td>");
        document.write("    </tr>");
    }

    document.write("</table>");

</script>
</head>
<body>
</body>
</html>
